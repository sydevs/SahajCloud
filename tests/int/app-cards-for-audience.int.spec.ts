import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AppCard, Audience, Client, Image } from '@/payload-types'

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
  let conditionAudience: Audience // condition-type, no constraints → always passes

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
  let contentCard: AppCard
  // AND-conditions gate cards
  let cardWithCondition: AppCard
  let cardWithMultipleConditions: AppCard

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUserId = env.adminUser.id

    const img = await testData.createMediaImage(payload, { alt: 'Shared card image' })
    const imageId = img.id

    // Always-match audiences — no configured range rules. Rule semantics are
    // tested in audiences-for-user.int.spec.ts; here we only care about
    // which audiences end up in the caller's `audiences` list.
    openAudience = await testData.createAudience(payload, {
      label: 'Open Audience',
    })

    // A "path-started" audience — emulate the difference by varying the
    // `audiences` list passed to the endpoint per test.
    pathStartedAudience = await testData.createAudience(payload, {
      label: 'Path Started',
      pathProgress: { min: 1, max: 5 },
    })

    nullRulesAudience = await testData.createAudience(payload, {
      label: 'Null Rules Audience',
    })

    // Unconstrained audience (always passes; used for AND-gate tests)
    conditionAudience = await testData.createAudience(payload, {
      label: 'Open Condition',
    })

    allEligible = [openAudience.id, pathStartedAudience.id, nullRulesAudience.id].join(',')
    openOnly = [openAudience.id, nullRulesAudience.id].join(',')

    // Hero card with open audience — present whenever Open is in the caller's list.
    heroCardOpen = await testData.createAppCard(payload, {
      default: { title: 'Hero Open', image: imageId },
      targetSections: ['hero'],
      audiences: [openAudience.id],
      weight: 3,
      _status: 'published',
    })

    // Hero card requiring the path-started audience.
    heroCardPathStarted = await testData.createAppCard(payload, {
      default: { title: 'Hero Path Started', image: imageId },
      targetSections: ['hero'],
      audiences: [pathStartedAudience.id],
      weight: 3,
      _status: 'published',
    })

    // Highlights-only card
    highlightsCard = await testData.createAppCard(payload, {
      default: { title: 'Highlights Only', image: imageId },
      targetSections: ['highlights'],
      audiences: [openAudience.id],
      weight: 3,
      _status: 'published',
    })

    // Draft card that should never appear
    draftHeroCard = await testData.createAppCard(payload, {
      default: { title: 'Draft Hero', image: imageId },
      targetSections: ['hero'],
      audiences: [openAudience.id],
      weight: 3,
      _status: 'draft',
    })

    // Card targeted to both sections
    bothSectionsCard = await testData.createAppCard(payload, {
      default: { title: 'Hero and Highlights', image: imageId },
      targetSections: ['hero', 'highlights'],
      audiences: [openAudience.id],
      weight: 3,
      _status: 'published',
    })

    nullRulesAudienceCard = await testData.createAppCard(payload, {
      default: { title: 'Null Rules Audience Card', image: imageId },
      targetSections: ['hero'],
      audiences: [nullRulesAudience.id],
      weight: 3,
      _status: 'published',
    })

    // Card with no audiences — must be hidden
    emptyAudiencesCard = await testData.createAppCard(payload, {
      default: { title: 'No Audiences', image: imageId },
      targetSections: ['hero'],
      audiences: [],
      weight: 3,
      _status: 'published',
    })

    // OR-match coverage: card with one matching + one non-matching audience
    // for a beginner caller (audiences=openOnly).
    multiAudienceCard = await testData.createAppCard(payload, {
      default: { title: 'Multi Audience Card', image: imageId },
      targetSections: ['hero'],
      audiences: [openAudience.id, pathStartedAudience.id],
      weight: 3,
      _status: 'published',
    })

    // OR-match coverage: card whose only audience is missing from the
    // caller's resolved list (audiences=openOnly excludes PathStarted).
    allFailingAudiencesCard = await testData.createAppCard(payload, {
      default: { title: 'All Failing Audiences Card', image: imageId },
      targetSections: ['hero'],
      audiences: [pathStartedAudience.id],
      weight: 3,
      _status: 'published',
    })

    // Card with album destination — verifies depth:1 population
    const contentAlbum = await testData.createAlbum(payload, { title: 'Content Album' })
    contentCard = await testData.createAppCard(payload, {
      default: {
        title: 'Content Card',
        image: imageId,
        destination: 'album',
        album: contentAlbum.id,
      },
      targetSections: ['hero'],
      audiences: [openAudience.id],
      weight: 3,
      _status: 'published',
    })

    // AND-conditions gate: card with a single condition audience
    cardWithCondition = await testData.createAppCard(payload, {
      default: { title: 'Card With Single Condition', image: imageId },
      targetSections: ['hero'],
      audiences: [openAudience.id],
      conditions: [conditionAudience.id],
      weight: 3,
      _status: 'published',
    })

    // AND-conditions gate: card with two condition audiences — both must be present
    const conditionAudienceB = await testData.createAudience(payload, {
      label: 'Open Condition B',
    })
    cardWithMultipleConditions = await testData.createAppCard(payload, {
      default: { title: 'Card With Two Conditions', image: imageId },
      targetSections: ['hero'],
      audiences: [openAudience.id],
      conditions: [conditionAudience.id, conditionAudienceB.id],
      weight: 3,
      _status: 'published',
    })
    // Store conditionAudienceB id on the card for assertions below
    ;(cardWithMultipleConditions as AppCard & { _conditionAudienceBId: number })._conditionAudienceBId =
      conditionAudienceB.id
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

  describe('AND-conditions gate', () => {
    it('includes card when its condition audience ID is present in the audiences list', async () => {
      const audiencesWithCondition = [
        openAudience.id,
        nullRulesAudience.id,
        conditionAudience.id,
      ].join(',')

      const { body } = await callEndpoint(
        payload,
        { targetSection: 'hero', limit: 20 },
        undefined,
        { defaultAudiences: audiencesWithCondition },
      )
      const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
      expect(ids).toContain(cardWithCondition.id)
    })

    it('excludes card when its condition audience ID is absent from the audiences list', async () => {
      // conditionAudience not included in openOnly — card is blocked
      const { body } = await callEndpoint(
        payload,
        { targetSection: 'hero', limit: 20 },
        undefined,
        { defaultAudiences: openOnly },
      )
      const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
      expect(ids).not.toContain(cardWithCondition.id)
    })

    it('requires ALL condition IDs to be present (AND semantics)', async () => {
      const condAudienceBId = (
        cardWithMultipleConditions as AppCard & { _conditionAudienceBId: number }
      )._conditionAudienceBId

      // Only conditionAudience (first) present — second is absent → excluded
      const onlyFirstCondition = [openAudience.id, conditionAudience.id].join(',')
      const { body: bodyMissing } = await callEndpoint(
        payload,
        { targetSection: 'hero', limit: 20 },
        undefined,
        { defaultAudiences: onlyFirstCondition },
      )
      const idsMissing = (bodyMissing as { docs: AppCard[] }).docs.map((c) => c.id)
      expect(idsMissing).not.toContain(cardWithMultipleConditions.id)

      // Both conditions present → included
      const bothConditions = [openAudience.id, conditionAudience.id, condAudienceBId].join(',')
      const { body: bodyBoth } = await callEndpoint(
        payload,
        { targetSection: 'hero', limit: 20 },
        undefined,
        { defaultAudiences: bothConditions },
      )
      const idsBoth = (bodyBoth as { docs: AppCard[] }).docs.map((c) => c.id)
      expect(idsBoth).toContain(cardWithMultipleConditions.id)
    })

    it('includes cards with no conditions regardless of the audiences list', async () => {
      // heroCardOpen has no conditions — passes the AND-gate automatically
      const { body } = await callEndpoint(
        payload,
        { targetSection: 'hero', limit: 20 },
        undefined,
        { defaultAudiences: allEligible },
      )
      const ids = (body as { docs: AppCard[] }).docs.map((c) => c.id)
      expect(ids).toContain(heroCardOpen.id)
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
      const forwardedReq = (
        appCardsCall![0] as {
          req?: { user?: { id: unknown; collection: string }; context?: Record<string, unknown> }
        }
      ).req
      expect(forwardedReq?.user?.id).toBe(client.id)
      expect(forwardedReq?.user?.collection).toBe('clients')
      expect(forwardedReq?.context?.['skipClientQueryValidation']).toBe(true)
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
    // default.image relationship populated
    const image = card!.default?.image as Image
    expect(typeof image).toBe('object')
    expect(image.id).toBeDefined()
    // default.album relationship populated
    const album = card!.default?.album
    expect(typeof album).toBe('object')
    expect((album as { id: number }).id).toBeDefined()
  })
})
