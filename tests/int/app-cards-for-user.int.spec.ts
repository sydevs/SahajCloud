import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Album, AppCard, Client, Image } from '@/payload-types'

import { appCardsForUser } from '@/endpoints'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

async function callEndpoint(
  payload: Payload,
  query: Record<string, string | number | boolean>,
  user?: { id: number | string; collection: string },
): Promise<{ status: number; body: unknown }> {
  const req = {
    payload,
    query,
    headers: new Headers(),
    routeParams: {},
    user,
  } as unknown as PayloadRequest

  const response = (await appCardsForUser.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, body }
}

describe('appCardsForUser endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  let heroCardAll: AppCard
  let heroCardRealized: AppCard
  let highlightsCard: AppCard
  let draftHeroCard: AppCard
  let bothSectionsCard: AppCard
  let contentAlbum: Album
  let contentCard: AppCard

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUserId = env.adminUser.id

    const img = await testData.createMediaImage(payload, { alt: 'Shared card image' })
    const imageId = img.id

    // Hero card with no rules — matches any caller
    heroCardAll = await testData.createAppCard(payload, {
      title: 'Hero All',
      image: imageId,
      targetSections: ['hero'],
      weight: 3,
      _status: 'published',
    })

    // Hero card requiring hasRealization=true AND pathProgress between 1 and 5
    heroCardRealized = await testData.createAppCard(payload, {
      title: 'Hero Realized',
      image: imageId,
      targetSections: ['hero'],
      rules: {
        logic: 'AND',
        hasRealization: true,
        pathProgress: { min: 1, max: 5 },
      },
      weight: 3,
      _status: 'published',
    })

    // Highlights-only card
    highlightsCard = await testData.createAppCard(payload, {
      title: 'Highlights Only',
      image: imageId,
      targetSections: ['highlights'],
      weight: 3,
      _status: 'published',
    })

    // Draft card that should never appear
    draftHeroCard = await testData.createAppCard(payload, {
      title: 'Draft Hero',
      image: imageId,
      targetSections: ['hero'],
      weight: 3,
      _status: 'draft',
    })

    // Card targeted to both sections
    bothSectionsCard = await testData.createAppCard(payload, {
      title: 'Hero and Highlights',
      image: imageId,
      targetSections: ['hero', 'highlights'],
      weight: 3,
      _status: 'published',
    })

    // Card with content relationship — verifies depth:1 population
    contentAlbum = await testData.createAlbum(payload, { title: 'Content Album' })
    contentCard = await testData.createAppCard(payload, {
      title: 'Content Card',
      image: imageId,
      type: 'content',
      content: { relationTo: 'albums', value: contentAlbum.id },
      appPage: null,
      targetSections: ['hero'],
      weight: 3,
      _status: 'published',
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('returns 400 when targetSection is missing', async () => {
    const { status } = await callEndpoint(payload, { limit: 5 })
    expect(status).toBe(400)
  })

  it('returns 400 when targetSection is invalid', async () => {
    const { status } = await callEndpoint(payload, { targetSection: 'footer', limit: 5 })
    expect(status).toBe(400)
  })

  it('returns 400 when limit is missing', async () => {
    const { status } = await callEndpoint(payload, { targetSection: 'hero' })
    expect(status).toBe(400)
  })

  it('returns 400 when limit is out of range', async () => {
    const low = await callEndpoint(payload, { targetSection: 'hero', limit: 0 })
    expect(low.status).toBe(400)
    const high = await callEndpoint(payload, { targetSection: 'hero', limit: 21 })
    expect(high.status).toBe(400)
  })

  it('excludes draft cards', async () => {
    const { status, body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
    })
    expect(status).toBe(200)
    const docs = (body as { docs: AppCard[] }).docs
    const ids = docs.map((c) => c.id)
    expect(ids).not.toContain(draftHeroCard.id)
  })

  it('filters by targetSection = hero', async () => {
    const { status, body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
    })
    expect(status).toBe(200)
    const docs = (body as { docs: AppCard[] }).docs
    const ids = docs.map((c) => c.id)
    expect(ids).toContain(heroCardAll.id)
    expect(ids).toContain(bothSectionsCard.id)
    expect(ids).not.toContain(highlightsCard.id)
  })

  it('filters by targetSection = highlights', async () => {
    const { status, body } = await callEndpoint(payload, {
      targetSection: 'highlights',
      limit: 20,
    })
    expect(status).toBe(200)
    const docs = (body as { docs: AppCard[] }).docs
    const ids = docs.map((c) => c.id)
    expect(ids).toContain(highlightsCard.id)
    expect(ids).toContain(bothSectionsCard.id)
    expect(ids).not.toContain(heroCardAll.id)
  })

  it('excludes cards whose rules do not match caller inputs', async () => {
    // Caller without hasRealization → heroCardRealized fails
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
    })
    const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
    expect(ids).not.toContain(heroCardRealized.id)
  })

  it('includes cards whose rules match caller inputs', async () => {
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
      hasRealization: 'true',
      pathProgress: 3,
    })
    const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
    expect(ids).toContain(heroCardRealized.id)
  })

  it('respects the limit parameter', async () => {
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 1,
    })
    const docs = (body as { docs: AppCard[] }).docs
    expect(docs).toHaveLength(1)
  })

  it('threads req through payload.find so usage-tracking and rate-limit hooks see the caller', async () => {
    // The hooks applied by usagePlugin read `req.user` to attribute a request
    // to a client. If the endpoint doesn't forward `req` to `payload.find`,
    // the hooks fire without a user and silently skip tracking/rate-limiting.
    const client = (await testData.createClient(payload, adminUserId, {
      name: 'Usage Tracking Forwarding Test',
    })) as Client

    const findSpy = vi.spyOn(payload, 'find')
    try {
      const { status } = await callEndpoint(
        payload,
        { targetSection: 'hero', limit: 5 },
        { id: client.id, collection: 'clients' },
      )
      expect(status).toBe(200)

      const appCardsCall = findSpy.mock.calls.find(
        ([args]) => (args as { collection?: string }).collection === 'app-cards',
      )
      expect(appCardsCall).toBeDefined()
      const forwardedReq = (appCardsCall![0] as { req?: { user?: { id: unknown; collection: string } } }).req
      expect(forwardedReq?.user?.id).toBe(client.id)
      expect(forwardedReq?.user?.collection).toBe('clients')
    } finally {
      findSpy.mockRestore()
    }
  })

  it('populates relationships at depth 1', async () => {
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
    })
    const docs = (body as { docs: AppCard[] }).docs
    const card = docs.find((c) => c.id === contentCard.id)
    expect(card).toBeDefined()
    // image relationship populated
    const image = card!.image as Image
    expect(typeof image).toBe('object')
    expect(image.id).toBeDefined()
    // content relationship populated
    const content = card!.content as { relationTo: string; value: Album }
    expect(content.relationTo).toBe('albums')
    expect(typeof content.value).toBe('object')
    expect((content.value as Album).title).toBe('Content Album')
  })
})
