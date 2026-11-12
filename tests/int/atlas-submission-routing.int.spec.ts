/**
 * Where an atlas submission goes: a new-event proposal onto the region tree
 * (#1021), and a registration opt-in onto the right mailing list (#1022).
 *
 * The intake cases run as a real published client with `overrideAccess: false`,
 * because the point of `location` is that it is the one location input a client
 * can write — `region` and `routingRegion` must still be stripped.
 *
 * Fixture pre-mortem: `createRegionNode` stores `mapboxId` as `<prefix>-<slug>`,
 * which `MAPBOX_FEATURE_ID` in `src/collections/UserSubmissions/fields.ts`
 * accepts, and its `level` values are the four `Regions.level` options. A
 * client's list ownership is `clients.region` + `mailingList.provider` +
 * published, read in `src/lib/atlas/mailingListOwners.ts`.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DELIVERERS } from '@/jobs/DeliverSubmissions/deliverers'
import type { Client, Manager, UserSubmission } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { verifyMock, subscribeMock, reviewMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  subscribeMock: vi.fn(),
  reviewMock: vi.fn(),
}))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({ verifyTurnstileToken: verifyMock }))

// Saving a list asks the provider whether the key works.
vi.mock('@/lib/mailingList/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mailingList/providers')>()),
  adapterFor: () => ({ verifyCredentials: async () => null }),
}))

vi.mock('@/lib/mailingList/subscribe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mailingList/subscribe')>()),
  subscribeToMailingList: subscribeMock,
}))

vi.mock('@/lib/notifications/sendSubmissionReview', () => ({ sendSubmissionReview: reviewMock }))

const PREFIX = 'routing'

describe('atlas submission routing', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Manager
  let widget: Client
  const region = {} as Record<'country' | 'state' | 'city' | 'otherCity' | 'venue', number>

  const clientReq = (): PayloadRequest =>
    ({
      payload,
      headers: new Headers({ 'x-turnstile-token': 'tok-valid' }),
      user: { ...widget, collection: 'clients' },
      context: {},
    }) as unknown as PayloadRequest

  const propose = (data: Record<string, unknown>) =>
    payload.create({
      collection: 'user-submissions',
      data: {
        type: 'proposal',
        senderEmail: 'proposer@example.com',
        proposed: { eventType: 'offline' },
        ...data,
      } as never,
      overrideAccess: false,
      req: clientReq(),
    }) as Promise<UserSubmission>

  const listClient = (name: string, regionId: number | null, listId: string) =>
    testData.createClient(payload, admin.id, {
      label: name,
      ...(regionId != null ? { region: regionId } : {}),
      mailingList: { provider: 'brevo', listId, apiKey: 'key' },
    } as never)

  const setFallback = (id: number | null) =>
    payload.updateGlobal({
      slug: 'sy-atlas-config',
      data: { canonicalFallbackClient: id, availableLocales: ['en'] } as never,
      context: { skipAvailableLocalesCheck: true },
      overrideAccess: true,
    })

  const offersMailingList = async (regionId: number) => {
    const event = await testData.createEvent(payload, { manager: admin.id, region: regionId })
    const read = await payload.findByID({ collection: 'events', id: event.id, depth: 0 })
    return read.offersMailingList
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    admin = await testData.createManager(payload, { email: 'routing-admin@example.com' })
    widget = await testData.createClient(payload, admin.id, {
      label: 'Routing Widget',
      roles: ['sahaj-atlas-client'],
    })

    region.country = await testData.createRegionNode(payload, {
      prefix: PREFIX,
      slug: 'country',
      level: 'country',
    })
    region.state = await testData.createRegionNode(payload, {
      prefix: PREFIX,
      slug: 'state',
      level: 'region',
      parent: region.country,
    })
    region.city = await testData.createRegionNode(payload, {
      prefix: PREFIX,
      slug: 'city',
      level: 'city',
      parent: region.state,
    })
    region.venue = await testData.createRegionNode(payload, {
      prefix: PREFIX,
      slug: 'hall',
      level: 'venue',
      parent: region.city,
    })
    region.otherCity = await testData.createRegionNode(payload, {
      prefix: PREFIX,
      slug: 'other-city',
      level: 'city',
      parent: region.state,
    })
  })

  afterAll(async () => {
    await setFallback(null)
    await cleanup()
  })

  beforeEach(() => {
    verifyMock
      .mockReset()
      .mockImplementation((token: string) =>
        Promise.resolve(token === 'tok-valid' ? { success: true } : { success: false }),
      )
    subscribeMock.mockReset().mockResolvedValue({ ok: true, status: 'accepted' })
    reviewMock.mockReset().mockResolvedValue(undefined)
  })

  describe('placing a new-event proposal (#1021)', () => {
    it('anchors it in the city its location names', async () => {
      const doc = await propose({
        proposed: { eventType: 'offline', address: { mapboxId: 'routing-unknown-address' } },
        location: {
          placeId: `${PREFIX}-city`,
          regionId: `${PREFIX}-state`,
          countryId: `${PREFIX}-country`,
        },
      })

      expect(doc.region).toMatchObject({ id: region.city })
      expect(doc.routingRegion).toMatchObject({ id: region.city })
    })

    it('leaves the city empty when only the state is on the atlas', async () => {
      const doc = await propose({
        location: { placeId: 'routing-missing-city', regionId: `${PREFIX}-state` },
      })

      // ⚠ The whole reason `routingRegion` is its own column: there is no
      // `region` to route by, and this is the row whose state manager
      // `deliverProposal` mails and whose subtree read must therefore reach it.
      expect(doc.region).toBeFalsy()
      expect(doc.routingRegion).toMatchObject({ id: region.state })
    })

    it('anchors it in a venue the address itself is', async () => {
      const doc = await propose({
        proposed: { eventType: 'offline', address: { mapboxId: `${PREFIX}-hall` } },
        location: { placeId: `${PREFIX}-city` },
      })

      expect(doc.region).toMatchObject({ id: region.venue })
      expect(doc.routingRegion).toMatchObject({ id: region.venue })
    })

    it('places an online class by the city it names', async () => {
      const doc = await propose({
        proposed: { eventType: 'online', onlineUrl: 'https://meet.example.com/class' },
        location: { placeId: `${PREFIX}-other-city` },
      })

      expect(doc.region).toMatchObject({ id: region.otherCity })
    })

    it('ignores a region or routingRegion the client writes itself', async () => {
      const doc = await propose({
        region: region.otherCity,
        routingRegion: region.otherCity,
        location: { placeId: `${PREFIX}-city` },
      })

      expect(doc.region).toMatchObject({ id: region.city })
      expect(doc.routingRegion).toMatchObject({ id: region.city })
    })

    it('refuses a location value that is not a Mapbox id', async () => {
      await expect(propose({ location: { placeId: 'see cheap.shop' } })).rejects.toThrow()
    })

    it('answers a non-string location id with a validation error, not a query error', async () => {
      await expect(propose({ location: { placeId: { in: ['x'] } } })).rejects.toMatchObject({
        status: 400,
      })
    })

    it('leaves a correction on its target event', async () => {
      const event = await testData.createEvent(payload, {
        manager: admin.id,
        region: region.otherCity,
      })
      await payload.update({
        collection: 'events',
        id: event.id,
        data: { _status: 'published' },
        context: { skipVerifyHook: true },
        overrideAccess: true,
      })

      const doc = await propose({ event: event.id, location: { placeId: `${PREFIX}-city` } })

      expect(doc.region).toBeFalsy()
      expect(doc.routingRegion).toBeFalsy()
    })

    /**
     * ⚠ **Routing is settled before the pace is read**, which is what these two
     * cases are about together. Who should hear about a proposal is a fact of
     * the atlas; whether they hear about it *now* is their own choice — and
     * reading the pace first would escalate a muted manager's proposal to
     * somebody else, which is not what a pace asks for (#1070).
     */
    const placeWithManager = async (pace: string) => {
      const stateManager = await testData.createManager(payload, {
        email: `state-lead-${pace.toLowerCase()}@example.com`,
        name: 'State Lead',
        notificationPreferences: { new_proposals: { frequency: pace, method: 'email' } },
      })
      await payload.update({
        collection: 'regions',
        data: { managers: [stateManager.id] },
        id: region.state,
        overrideAccess: true,
      })
      const doc = await propose({
        location: { placeId: `routing-missing-city-${pace}`, regionId: `${PREFIX}-state` },
      })
      return {
        email: stateManager.email,
        outcome: await DELIVERERS.proposal.deliver({
          req: { context: {}, payload } as unknown as PayloadRequest,
          submission: doc,
        }),
      }
    }

    it('emails the nearest manager above the placed region, at Immediate', async () => {
      const { email, outcome } = await placeWithManager('Immediate')

      expect(outcome).toMatchObject({ ok: true, sentTo: email })
      expect(reviewMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'new-event', to: email }),
      )
    })

    it('sends nothing at a digest pace, and says the digest carries it', async () => {
      reviewMock.mockClear()
      const { email, outcome } = await placeWithManager('Daily')

      expect(outcome).toMatchObject({ ok: true, sentTo: `${email} (in their daily digest)` })
      expect(reviewMock).not.toHaveBeenCalled()
    })
  })

  describe('the registration opt-in list (#1022)', () => {
    it('offers no list when nothing above the class has one', async () => {
      await setFallback(null)
      expect(await offersMailingList(region.city)).toBe(false)
    })

    it('offers the list of a client owning a region above the class', async () => {
      const stateList = await listClient('State List', region.state, 'state-list')
      try {
        expect(await offersMailingList(region.city)).toBe(true)
      } finally {
        await payload.delete({ collection: 'clients', id: stateList.id, overrideAccess: true })
      }
    })

    it('answers a client selecting only the flag, and skips list reads', async () => {
      const stateList = await listClient('State List 2', region.state, 'state-list-2')
      try {
        const event = await testData.createEvent(payload, {
          manager: admin.id,
          region: region.city,
        })
        // `region` is not selected: `ensureVirtualFieldDeps` has to add it back.
        const selected = await payload.findByID({
          collection: 'events',
          id: event.id,
          depth: 0,
          select: { offersMailingList: true },
        })
        expect(selected.offersMailingList).toBe(true)

        const listed = await payload.find({
          collection: 'events',
          where: { id: { equals: event.id } },
          depth: 0,
        })
        expect(listed.docs[0]?.offersMailingList).toBeNull()
      } finally {
        await payload.delete({ collection: 'clients', id: stateList.id, overrideAccess: true })
      }
    })

    it('falls back to the canonical fallback client’s list', async () => {
      const central = await listClient('We Meditate', null, 'central-list')
      await setFallback(central.id)
      try {
        expect(await offersMailingList(region.otherCity)).toBe(true)
      } finally {
        await setFallback(null)
        await payload.delete({ collection: 'clients', id: central.id, overrideAccess: true })
      }
    })

    it('delivers an opt-in to the nearest owner’s list, not the relaying client’s', async () => {
      const central = await listClient('We Meditate Central', null, 'central')
      const cityList = await listClient('City List', region.city, 'city-list')
      await setFallback(central.id)
      try {
        const event = await testData.createEvent(payload, {
          manager: admin.id,
          region: region.city,
        })
        const row = (await payload.create({
          collection: 'user-submissions',
          data: createData<'user-submissions'>({
            type: 'subscribe',
            senderEmail: 'reg@example.com',
            event: event.id,
            client: widget.id,
          }),
          overrideAccess: true,
          context: { skipWriteGuard: true },
        })) as UserSubmission

        const outcome = await DELIVERERS.subscribe.deliver({
          req: { payload, context: {} } as unknown as PayloadRequest,
          submission: row,
        })

        expect(outcome).toMatchObject({ ok: true })
        expect(subscribeMock).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({ listId: 'city-list' }),
            source: 'event-registration',
          }),
        )
      } finally {
        await setFallback(null)
        for (const id of [central.id, cityList.id]) {
          await payload.delete({ collection: 'clients', id, overrideAccess: true })
        }
      }
    })
  })
})
