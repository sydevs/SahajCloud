import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Album, AppCard, Audience, Client, Image } from '@/payload-types'

import { appCardsForAudience } from '@/endpoints'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// `audiences` is a required, non-empty comma-separated list of IDs.
// Tests that don't exercise a specific eligibility scenario still need to
// pass a valid value; pass `{ skipDefaultAudiences: true }` on the
// 400-validation cases that want to omit it.
async function callEndpoint(
  payload: Payload,
  query: Record<string, string | number | boolean>,
  user?: { id: number | string; collection: string },
  options: { skipDefaultAudiences?: boolean; defaultAudiences?: string } = {},
): Promise<{ status: number; headers: Headers; body: unknown }> {
  const finalQuery = options.skipDefaultAudiences
    ? query
    : { audiences: options.defaultAudiences ?? '', ...query }
  const req = {
    payload,
    query: finalQuery,
    headers: new Headers(),
    routeParams: {},
    user,
  } as unknown as PayloadRequest

  const response = (await appCardsForAudience.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, headers: response.headers, body }
}

describe('appCardsForAudience endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  let openAudience: Audience
  let pathStartedAudience: Audience
  let nullRulesAudience: Audience

  // Audience-ID combinations representative of the previous rule scenarios:
  // - allEligible:  resolved audiences for a "path-started" caller
  //   (Open + PathStarted + NullRules — the union of every always-match
  //   plus a positive pathProgress audience).
  // - openOnly:     resolved audiences for a beginner who hasn't started
  //   the path (Open + NullRules — PathStarted requires min:1).
  let allEligible: string
  let openOnly: string

  let heroCardOpen: AppCard
  let heroCardPathStarted: AppCard
  let highlightsCard: AppCard
  let draftHeroCard: AppCard
  let bothSectionsCard: AppCard
  let nullRulesAudienceCard: AppCard
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

    // Always-match audience — no configured rules. (Rule semantics are now
    // tested in audiences-for-user.int.spec.ts; here we only care about
    // which audiences end up in the caller's `audiences` list.)
    openAudience = await testData.createAudience(payload, {
      label: 'Open Audience',
      rules: {},
    })

    // A "path-started" audience the new resolver would only return for callers
    // with pathProgress >= 1. We emulate the difference by varying the
    // `audiences` list passed to the endpoint per test.
    pathStartedAudience = await testData.createAudience(payload, {
      label: 'Path Started',
      rules: {
        logic: 'AND',
        pathProgress: { min: 1, max: 5 },
      },
    })

    nullRulesAudience = await testData.createAudience(payload, {
      label: 'Null Rules Audience',
      rules: null,
    })

    allEligible = [openAudience.id, pathStartedAudience.id, nullRulesAudience.id].join(',')
    openOnly = [openAudience.id, nullRulesAudience.id].join(',')

    // Hero card with open audience — present whenever Open is in the caller's list.
    heroCardOpen = await testData.createAppCard(payload, {
      title: 'Hero Open',
      image: imageId,
      targetSections: ['hero'],
      audiences: [openAudience.id],
      weight: 3,
      _status: 'published',
    })

    // Hero card requiring the path-started audience.
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

    nullRulesAudienceCard = await testData.createAppCard(payload, {
      title: 'Null Rules Audience Card',
      image: imageId,
      targetSections: ['hero'],
      audiences: [nullRulesAudience.id],
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

    // OR-match coverage: card with one matching + one non-matching audience
    // for a beginner caller (audiences=openOnly).
    multiAudienceCard = await testData.createAppCard(payload, {
      title: 'Multi Audience Card',
      image: imageId,
      targetSections: ['hero'],
      audiences: [openAudience.id, pathStartedAudience.id],
      weight: 3,
      _status: 'published',
    })

    // OR-match coverage: card whose only audience is missing from the
    // caller's resolved list (audiences=openOnly excludes PathStarted).
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

  describe('Validation', () => {
    it('returns 400 when targetSection is missing', async () => {
      const { status } = await callEndpoint(payload, { limit: 5 }, undefined, {
        defaultAudiences: allEligible,
      })
      expect(status).toBe(400)
    })

    it('returns 400 when targetSection is invalid', async () => {
      const { status } = await callEndpoint(
        payload,
        { targetSection: 'footer', limit: 5 },
        undefined,
        { defaultAudiences: allEligible },
      )
      expect(status).toBe(400)
    })

    it('returns 400 when limit is missing', async () => {
      const { status } = await callEndpoint(
        payload,
        { targetSection: 'hero' },
        undefined,
        { defaultAudiences: allEligible },
      )
      expect(status).toBe(400)
    })

    it('returns 400 when limit is out of range', async () => {
      const low = await callEndpoint(payload, { targetSection: 'hero', limit: 0 }, undefined, {
        defaultAudiences: allEligible,
      })
      expect(low.status).toBe(400)
      const high = await callEndpoint(payload, { targetSection: 'hero', limit: 21 }, undefined, {
        defaultAudiences: allEligible,
      })
      expect(high.status).toBe(400)
    })

    it('returns 400 when audiences is missing', async () => {
      const { status } = await callEndpoint(
        payload,
        { targetSection: 'hero', limit: 5 },
        undefined,
        { skipDefaultAudiences: true },
      )
      expect(status).toBe(400)
    })

    it('returns 400 when audiences is empty', async () => {
      const { status } = await callEndpoint(payload, {
        audiences: '',
        targetSection: 'hero',
        limit: 5,
      })
      expect(status).toBe(400)
    })

    it('returns 400 when audiences contains non-numeric values', async () => {
      const { status } = await callEndpoint(payload, {
        audiences: '1,abc',
        targetSection: 'hero',
        limit: 5,
      })
      expect(status).toBe(400)
    })
  })

  describe('Cache headers', () => {
    it('sets Cache-Control: public, max-age=600, s-maxage=600', async () => {
      const { headers, status } = await callEndpoint(
        payload,
        { targetSection: 'hero', limit: 5 },
        undefined,
        { defaultAudiences: allEligible },
      )
      expect(status).toBe(200)
      expect(headers.get('Cache-Control')).toBe('public, max-age=600, s-maxage=600')
    })
  })

  describe('audiences param normalization', () => {
    it('treats unsorted/duplicated audiences as equivalent to the canonical sorted form', async () => {
      const canonical = [openAudience.id, pathStartedAudience.id].join(',')
      const messy = [pathStartedAudience.id, openAudience.id, openAudience.id].join(',')

      const a = await callEndpoint(payload, {
        audiences: canonical,
        targetSection: 'hero',
        limit: 20,
      })
      const b = await callEndpoint(payload, {
        audiences: messy,
        targetSection: 'hero',
        limit: 20,
      })
      expect(a.status).toBe(200)
      expect(b.status).toBe(200)

      const idsA = (a.body as { docs: AppCard[] }).docs.map((c) => c.id).sort((x, y) => x - y)
      const idsB = (b.body as { docs: AppCard[] }).docs.map((c) => c.id).sort((x, y) => x - y)
      expect(idsA).toEqual(idsB)
    })
  })

  it('excludes draft cards', async () => {
    const { status, body } = await callEndpoint(
      payload,
      { targetSection: 'hero', limit: 20 },
      undefined,
      { defaultAudiences: allEligible },
    )
    expect(status).toBe(200)
    const docs = (body as { docs: AppCard[] }).docs
    const ids = docs.map((c) => c.id)
    expect(ids).not.toContain(draftHeroCard.id)
  })

  it('filters by targetSection = hero', async () => {
    const { status, body } = await callEndpoint(
      payload,
      { targetSection: 'hero', limit: 20 },
      undefined,
      { defaultAudiences: allEligible },
    )
    expect(status).toBe(200)
    const docs = (body as { docs: AppCard[] }).docs
    const ids = docs.map((c) => c.id)
    expect(ids).toContain(heroCardOpen.id)
    expect(ids).toContain(bothSectionsCard.id)
    expect(ids).not.toContain(highlightsCard.id)
  })

  it('filters by targetSection = highlights', async () => {
    const { status, body } = await callEndpoint(
      payload,
      { targetSection: 'highlights', limit: 20 },
      undefined,
      { defaultAudiences: allEligible },
    )
    expect(status).toBe(200)
    const docs = (body as { docs: AppCard[] }).docs
    const ids = docs.map((c) => c.id)
    expect(ids).toContain(highlightsCard.id)
    expect(ids).toContain(bothSectionsCard.id)
    expect(ids).not.toContain(heroCardOpen.id)
  })

  it('excludes cards with empty audiences', async () => {
    const { body } = await callEndpoint(
      payload,
      { targetSection: 'hero', limit: 20 },
      undefined,
      { defaultAudiences: allEligible },
    )
    const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
    expect(ids).not.toContain(emptyAudiencesCard.id)
  })

  it('excludes cards whose audiences are not in the requested list', async () => {
    // Caller's resolved audiences don't include pathStartedAudience.
    const { body } = await callEndpoint(
      payload,
      { targetSection: 'hero', limit: 20 },
      undefined,
      { defaultAudiences: openOnly },
    )
    const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
    expect(ids).not.toContain(heroCardPathStarted.id)
  })

  it('includes cards whose audiences are in the requested list', async () => {
    const { body } = await callEndpoint(
      payload,
      { targetSection: 'hero', limit: 20 },
      undefined,
      { defaultAudiences: allEligible },
    )
    const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
    expect(ids).toContain(heroCardPathStarted.id)
  })

  it('includes cards attached to a null-rules audience when that ID is in the request', async () => {
    const { body } = await callEndpoint(
      payload,
      { targetSection: 'hero', limit: 20 },
      undefined,
      { defaultAudiences: openOnly },
    )
    const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
    expect(ids).toContain(nullRulesAudienceCard.id)
  })

  describe('OR-match audiences', () => {
    it('includes a card when ANY of its audiences overlaps the requested list', async () => {
      // Beginner caller (openOnly = Open + NullRules). multiAudienceCard has
      // [Open, PathStarted] — Open matches, so the card is included.
      const { body } = await callEndpoint(
        payload,
        { targetSection: 'hero', limit: 20 },
        undefined,
        { defaultAudiences: openOnly },
      )
      const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
      expect(ids).toContain(multiAudienceCard.id)
    })

    it('excludes a card when NONE of its audiences are in the requested list', async () => {
      // Beginner caller — allFailingAudiencesCard has only [PathStarted],
      // which is not in `openOnly`.
      const { body } = await callEndpoint(
        payload,
        { targetSection: 'hero', limit: 20 },
        undefined,
        { defaultAudiences: openOnly },
      )
      const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
      expect(ids).not.toContain(allFailingAudiencesCard.id)
    })
  })

  it('respects the limit parameter', async () => {
    const { body } = await callEndpoint(
      payload,
      { targetSection: 'hero', limit: 1 },
      undefined,
      { defaultAudiences: allEligible },
    )
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
        { defaultAudiences: allEligible },
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
    const { body } = await callEndpoint(
      payload,
      { targetSection: 'hero', limit: 20 },
      undefined,
      { defaultAudiences: allEligible },
    )
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
