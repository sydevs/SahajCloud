import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Album, AppCard, Audience, Client, Image } from '@/payload-types'

import { appCardsForAudience } from '@/endpoints'

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

  const response = (await appCardsForAudience.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, body }
}

describe('appCardsForAudience endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  let openAudience: Audience
  let pathStartedAudience: Audience
  let heroCardOpen: AppCard
  let heroCardPathStarted: AppCard
  let highlightsCard: AppCard
  let draftHeroCard: AppCard
  let bothSectionsCard: AppCard
  let emptyAudiencesCard: AppCard
  let multiAudienceCard: AppCard
  let allFailingAudiencesCard: AppCard
  let contentAlbum: Album
  let contentCard: AppCard

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUserId = env.adminUser.id

    const img = await testData.createMediaImage(payload, { alt: 'Shared card image' })
    const imageId = img.id

    // Always-match audience — no configured rules
    openAudience = await testData.createAudience(payload, {
      label: 'Open Audience',
      rules: {},
    })

    // Audience requiring pathProgress >= 1 (replaces the old hasRealization boolean)
    pathStartedAudience = await testData.createAudience(payload, {
      label: 'Path Started',
      rules: {
        logic: 'AND',
        pathProgress: { min: 1, max: 5 },
      },
    })

    // Hero card with open audience — matches any caller with pathProgress in any range
    heroCardOpen = await testData.createAppCard(payload, {
      title: 'Hero Open',
      image: imageId,
      targetSections: ['hero'],
      audiences: [openAudience.id],
      weight: 3,
      _status: 'published',
    })

    // Hero card requiring pathProgress in [1, 5]
    heroCardPathStarted = await testData.createAppCard(payload, {
      title: 'Hero Path Started',
      image: imageId,
      targetSections: ['hero'],
      audiences: [pathStartedAudience.id],
      weight: 3,
      _status: 'published',
    })

    // Highlights-only card
    highlightsCard = await testData.createAppCard(payload, {
      title: 'Highlights Only',
      image: imageId,
      targetSections: ['highlights'],
      audiences: [openAudience.id],
      weight: 3,
      _status: 'published',
    })

    // Draft card that should never appear
    draftHeroCard = await testData.createAppCard(payload, {
      title: 'Draft Hero',
      image: imageId,
      targetSections: ['hero'],
      audiences: [openAudience.id],
      weight: 3,
      _status: 'draft',
    })

    // Card targeted to both sections
    bothSectionsCard = await testData.createAppCard(payload, {
      title: 'Hero and Highlights',
      image: imageId,
      targetSections: ['hero', 'highlights'],
      audiences: [openAudience.id],
      weight: 3,
      _status: 'published',
    })

    // Card with no audiences — must be hidden
    emptyAudiencesCard = await testData.createAppCard(payload, {
      title: 'No Audiences',
      image: imageId,
      targetSections: ['hero'],
      audiences: [],
      weight: 3,
      _status: 'published',
    })

    // OR-match coverage: card with one passing + one failing audience.
    // For pathProgress=0 → openAudience passes (rules:{}, always matches),
    // pathStartedAudience fails. Card should be included.
    multiAudienceCard = await testData.createAppCard(payload, {
      title: 'Multi Audience Card',
      image: imageId,
      targetSections: ['hero'],
      audiences: [openAudience.id, pathStartedAudience.id],
      weight: 3,
      _status: 'published',
    })

    // OR-match coverage: card with only failing audience.
    // For pathProgress=0 → pathStartedAudience fails (min:1). Card should be excluded.
    allFailingAudiencesCard = await testData.createAppCard(payload, {
      title: 'All Failing Audiences Card',
      image: imageId,
      targetSections: ['hero'],
      audiences: [pathStartedAudience.id],
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
      audiences: [openAudience.id],
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
      pathProgress: 3,
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
      pathProgress: 3,
    })
    expect(status).toBe(200)
    const docs = (body as { docs: AppCard[] }).docs
    const ids = docs.map((c) => c.id)
    expect(ids).toContain(heroCardOpen.id)
    expect(ids).toContain(bothSectionsCard.id)
    expect(ids).not.toContain(highlightsCard.id)
  })

  it('filters by targetSection = highlights', async () => {
    const { status, body } = await callEndpoint(payload, {
      targetSection: 'highlights',
      limit: 20,
      pathProgress: 3,
    })
    expect(status).toBe(200)
    const docs = (body as { docs: AppCard[] }).docs
    const ids = docs.map((c) => c.id)
    expect(ids).toContain(highlightsCard.id)
    expect(ids).toContain(bothSectionsCard.id)
    expect(ids).not.toContain(heroCardOpen.id)
  })

  it('excludes cards with empty audiences', async () => {
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
      pathProgress: 3,
    })
    const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
    expect(ids).not.toContain(emptyAudiencesCard.id)
  })

  it('excludes cards whose audiences do not match caller inputs', async () => {
    // Caller with pathProgress=0 → pathStartedAudience requires min:1, so fails
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
      pathProgress: 0,
    })
    const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
    expect(ids).not.toContain(heroCardPathStarted.id)
  })

  it('includes cards whose audiences match caller inputs', async () => {
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 20,
      pathProgress: 3,
    })
    const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
    expect(ids).toContain(heroCardPathStarted.id)
  })

  describe('OR-match audiences', () => {
    it('includes a card when ANY of its audiences passes', async () => {
      // pathProgress=0 → openAudience (rules:{}) passes, pathStartedAudience (min:1) fails.
      // Card has both → should be included.
      const { body } = await callEndpoint(payload, {
        targetSection: 'hero',
        limit: 20,
        pathProgress: 0,
      })
      const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
      expect(ids).toContain(multiAudienceCard.id)
    })

    it('excludes a card when ALL of its audiences fail', async () => {
      // pathProgress=0 → pathStartedAudience (min:1) fails. Card has only that one.
      const { body } = await callEndpoint(payload, {
        targetSection: 'hero',
        limit: 20,
        pathProgress: 0,
      })
      const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
      expect(ids).not.toContain(allFailingAudiencesCard.id)
    })
  })

  it('respects the limit parameter', async () => {
    const { body } = await callEndpoint(payload, {
      targetSection: 'hero',
      limit: 1,
      pathProgress: 3,
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
        { targetSection: 'hero', limit: 5, pathProgress: 3 },
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
      pathProgress: 3,
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
