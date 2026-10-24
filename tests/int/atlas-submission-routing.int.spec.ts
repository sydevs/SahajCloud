/**
 * Where an atlas submission goes: a new-event proposal onto the region tree
 * (#1021), and a registration opt-in onto the right mailing list (#1022).
 *
 * The intake cases run as a real published client with `overrideAccess: false`,
 * because the point of `location` is that it is the one location input a client
 * can write — `region` and `regionHint` must still be stripped.
 *
 * Fixture pre-mortem: `createRegionNode` stores `mapboxId` as `<prefix>-<slug>`,
 * which `MAPBOX_FEATURE_ID` in `src/collections/UserSubmissions/fields.ts`
 * accepts, and its `level` values are the four `Regions.level` options. A
 * client's list ownership is `clients.region` + `mailingList.enabled` +
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

// Saving an enabled list asks the provider whether the key works.
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
  const region = {} as Record<'country' | 'state' | 'city' | 'otherCity', number>

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
      name,
      ...(regionId != null ? { region: regionId } : {}),
      mailingList: { enabled: true, provider: 'brevo', listId, apiKey: 'key' },
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
      name: 'Routing Widget',
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
        location: {
          mapboxId: 'routing-unknown-address',
          placeId: `${PREFIX}-city`,
          regionId: `${PREFIX}-state`,
          countryId: `${PREFIX}-country`,
        },
      })

      expect(doc.region).toMatchObject({ id: region.city })
      expect(doc.regionHint).toEqual({
        country: region.country,
        state: region.state,
        anchorRegion: region.city,
      })
    })

    it('leaves the city empty when only the state is on the atlas', async () => {
      const doc = await propose({
        location: { placeId: 'routing-missing-city', regionId: `${PREFIX}-state` },
      })

      expect(doc.region).toBeFalsy()
      expect(doc.regionHint).toEqual({ state: region.state })
    })

    it('ignores a region or regionHint the client writes itself', async () => {
      const doc = await propose({
        region: region.otherCity,
        regionHint: { anchorRegion: region.otherCity },
        location: { placeId: `${PREFIX}-city` },
      })

      expect(doc.region).toMatchObject({ id: region.city })
      expect(doc.regionHint).toEqual({ anchorRegion: region.city })
    })

    it('refuses a location value that is not a Mapbox id', async () => {
      await expect(propose({ location: { placeId: 'see cheap.shop' } })).rejects.toThrow()
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
      expect(doc.regionHint).toBeFalsy()
    })

    it('emails the nearest manager above the placed region', async () => {
      const stateManager = await testData.createManager(payload, {
        name: 'State Lead',
        email: 'state-lead@example.com',
      })
      await payload.update({
        collection: 'regions',
        id: region.state,
        data: { managers: [stateManager.id] },
        overrideAccess: true,
      })
      const doc = await propose({
        location: { placeId: 'routing-missing-city-2', regionId: `${PREFIX}-state` },
      })

      const outcome = await DELIVERERS.proposal.deliver({
        req: { payload, context: {} } as unknown as PayloadRequest,
        submission: doc,
      })

      expect(outcome).toMatchObject({ ok: true, sentTo: 'state-lead@example.com' })
      expect(reviewMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'state-lead@example.com', kind: 'new-event' }),
      )
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
