// The review cases moved with the code to `tests/int/user-submissions-review-lifecycle.int.spec.ts` (#796).
/**
 * Integration tests for the EventSubmissions intake (write-guard plugin →
 * prepareSubmission gates → ScreenEventSubmissions job).
 *
 * External dependencies stubbed: the Turnstile siteverify call, the MX lookup,
 * and the Mapbox geocoder. The mailer is spied (`payload.sendEmail`).
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EventSubmission, Manager } from '@/payload-types'
import { hasPermission } from '@/plugins/access'

import { runTaskHandler } from '../utils/taskRunner'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { verifyMock, mxMock, geocodeMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  mxMock: vi.fn(),
  geocodeMock: vi.fn(),
}))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))
vi.mock('@/lib/antiSpam/mxRecords', () => ({
  hasMxRecords: mxMock,
}))
vi.mock('@/lib/mapbox/geocoder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mapbox/geocoder')>()),
  resolveRegionLocation: geocodeMock,
}))

// Imported after the mocks so the modules pick up the stubs.
const { ScreenEventSubmissions } =
  await import('@/jobs/ScreenEventSubmissions/ScreenEventSubmissions')
const { proposableEventFields } =
  await import('@/collections/UserSubmissions/hooks/validateProposal')

describe('Event submissions', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let regionManager: Manager
  let countryId: number
  let cityId: number

  /** A `req` that looks like the Atlas widget's client key. */
  const clientReq = (headers: Record<string, string> = {}) =>
    ({
      payload,
      headers: new Headers(headers),
      user: { id: 999, collection: 'clients', _status: 'published' },
      context: {},
    }) as unknown as PayloadRequest

  const VALID_TURNSTILE = { 'x-turnstile-token': 'tok-valid' }

  const baseSubmission = {
    submitterName: 'Aria Visitor',
    submitterEmail: 'aria@example.com',
    eventType: 'offline' as const,
    address: { city: 'Novo Selo', street: '1 Main St' },
  }

  /**
   * Assemble the body the Atlas widget actually POSTs from a flat description.
   *
   * The submission stores one `proposed` Events patch plus `submitterInfo` /
   * `regionHint`. These specs describe a submission flatly because that reads
   * better, and the mapping lives here so it is stated once. Anything not
   * recognised as intake metadata is an Events field and goes into `proposed`.
   */
  const toBody = (flat: Record<string, unknown>) => {
    const {
      submitterName,
      submitterEmail,
      submitterNote,
      country,
      state,
      anchorRegion,
      event,
      status,
      region,
      ...proposed
    } = flat
    return {
      ...(event !== undefined ? { event } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(region !== undefined ? { region } : {}),
      submitterInfo: { name: submitterName, email: submitterEmail, note: submitterNote },
      regionHint: { country, state, anchorRegion },
      proposed,
    }
  }

  /** Create a submission as the client (guard + prepare hooks run). */
  const submit = (
    data: Record<string, unknown>,
    headers: Record<string, string> = VALID_TURNSTILE,
  ) =>
    payload.create({
      collection: 'event-submissions',
      data: toBody(data) as never,
      overrideAccess: true,
      req: clientReq(headers),
    })

  const runScreening = (submissionId: number) =>
    runTaskHandler(ScreenEventSubmissions, { payload, input: { submissionId } })

  const reload = (id: number) =>
    payload.findByID({
      collection: 'event-submissions',
      id,
      depth: 0,
      overrideAccess: true,
    }) as Promise<EventSubmission>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    regionManager = await testData.createManager(payload, {
      name: 'Region Reviewer',
      email: 'region-reviewer@example.com',
    })
    const country = await testData.createRegion(payload, {
      name: 'Submissia',
      level: 'country',
      slug: 'sb',
      managers: [regionManager.id],
    })
    countryId = country.id
    const city = await testData.createRegion(payload, {
      name: 'Sub City',
      level: 'city',
      parent: countryId,
    })
    cityId = city.id
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    verifyMock.mockReset().mockResolvedValue({ success: true })
    mxMock.mockReset().mockResolvedValue(true)
    geocodeMock.mockReset().mockResolvedValue({
      location: { mapboxId: 'place.submission-test', manual: false },
      warning: undefined,
    })
  })

  describe('write-guard on client create', () => {
    it('rejects a missing/failed captcha with 403 captcha_failed', async () => {
      verifyMock.mockResolvedValue({ success: false, reason: 'rejected', errorCodes: [] })
      await expect(submit({ ...baseSubmission, country: countryId })).rejects.toMatchObject({
        status: 403,
        data: { code: 'captcha_failed' },
      })
    })

    it('rejects URLs in free text with 400 urls_not_allowed', async () => {
      await expect(
        submit({
          ...baseSubmission,
          country: countryId,
          description: 'Great class, see https://spam.example for details',
        }),
      ).rejects.toMatchObject({ status: 400, data: { code: 'urls_not_allowed' } })
    })

    it('rejects a disposable submitter email with 400 disposable_email', async () => {
      await expect(
        submit({
          ...baseSubmission,
          country: countryId,
          submitterEmail: 'spam@mailinator.com',
        }),
      ).rejects.toMatchObject({ status: 400, data: { code: 'disposable_email' } })
    })

    it('a manager save is never guarded (no captcha demanded)', async () => {
      verifyMock.mockResolvedValue({ success: false, reason: 'rejected', errorCodes: [] })
      const created = await payload.create({
        collection: 'event-submissions',
        data: toBody({ ...baseSubmission, country: countryId, status: 'pending' }) as never,
        overrideAccess: true,
      })
      expect(created.status).toBe('pending')
      expect(verifyMock).not.toHaveBeenCalled()
    })
  })

  describe('prepareSubmission gates', () => {
    it('forces client submissions to screening and upserts the submitter', async () => {
      const created = await submit({
        ...baseSubmission,
        country: countryId,
        status: 'pending', // forged — must be forced back
      })
      expect(created.status).toBe('screening')
      const submitterId =
        typeof created.submitter === 'object' ? created.submitter?.id : created.submitter
      expect(submitterId).toBeTruthy()
      const user = await payload.findByID({
        collection: 'users',
        id: submitterId as number,
        overrideAccess: true,
      })
      expect(user.email).toBe('aria@example.com')
    })

    it('rejects an update proposal for an unpublished event with 409', async () => {
      const draftEvent = await testData.createEvent(payload, { _status: 'draft' })
      await expect(submit({ ...baseSubmission, event: draftEvent.id })).rejects.toMatchObject({
        status: 409,
        data: { code: 'event_not_published' },
      })
    })

    it('rejects a new event without a country or anchor with 400', async () => {
      await expect(submit({ ...baseSubmission })).rejects.toMatchObject({
        status: 400,
        data: { code: 'region_target_missing' },
      })
    })

    it('accepts an anchor-only submission', async () => {
      const created = await submit({ ...baseSubmission, anchorRegion: cityId })
      expect(created.status).toBe('screening')
    })
  })

  describe('screening job', () => {
    let sendEmail: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      sendEmail = vi.spyOn(payload, 'sendEmail').mockResolvedValue(undefined as never)
      // spyOn returns the same spy on re-entry — clear the recorded calls.
      sendEmail.mockClear()
    })

    it('classifies an undeliverable email as spam and notifies nobody', async () => {
      const created = await submit({ ...baseSubmission, country: countryId })
      mxMock.mockResolvedValue(false)

      const output = await runScreening(created.id)
      expect(output.status).toBe('spam')

      const after = await reload(created.id)
      expect(after.status).toBe('spam')
      expect((after.screeningResult as { emailVerdict?: string } | null)?.emailVerdict).toBe(
        'no_mx_records',
      )
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('uses the anchor region and notifies the nearest region manager', async () => {
      const created = await submit({ ...baseSubmission, anchorRegion: cityId })

      const output = await runScreening(created.id)
      expect(output.status).toBe('pending')

      const after = await reload(created.id)
      expect(after.status).toBe('pending')
      expect(typeof after.region === 'object' ? after.region?.id : after.region).toBe(cityId)

      expect(sendEmail).toHaveBeenCalledTimes(1)
      const message = sendEmail.mock.calls[0][0] as { to: string; html: string }
      expect(message.to).toBe('region-reviewer@example.com')
      // The email now links to the submission's admin edit view — the only
      // review surface, where the diff and live preview are.
      expect(message.html).toContain('/admin/collections/event-submissions/')
    })

    it('auto-creates the city under the chosen country via the geocoder', async () => {
      const created = await submit({
        ...baseSubmission,
        country: countryId,
        address: { city: 'Brand New Town' },
      })

      const output = await runScreening(created.id)
      expect(output.status).toBe('pending')

      const after = await reload(created.id)
      const regionId = typeof after.region === 'object' ? after.region?.id : after.region
      expect(regionId).toBeTruthy()
      const region = await payload.findByID({
        collection: 'regions',
        id: regionId as number,
        overrideAccess: true,
        depth: 0,
      })
      expect(region.level).toBe('city')
      expect(region.name).toBe('Brand New Town')
      expect(region.mapboxId).toBe('place.submission-test')
      expect(typeof region.parent === 'object' ? region.parent?.id : region.parent).toBe(countryId)
    })

    it('routes an update proposal to the target event’s manager', async () => {
      const eventManager = await testData.createManager(payload, {
        name: 'Owning Manager',
        email: 'owning-manager@example.com',
      })
      const event = await testData.createEvent(payload, {
        manager: eventManager.id,
        _status: 'published',
      })
      const { address: _routeAddress, ...routeBase } = baseSubmission
      const created = await submit({
        ...routeBase,
        event: event.id,
        contactPhone: '+44 20 1234 5678',
      })

      await runScreening(created.id)

      expect(sendEmail).toHaveBeenCalledTimes(1)
      expect((sendEmail.mock.calls[0][0] as { to: string }).to).toBe('owning-manager@example.com')
    })

    it('falls back to the system contact when no manager exists anywhere', async () => {
      const lonelyCountry = await testData.createRegion(payload, {
        name: 'Managerless Land',
        level: 'country',
        slug: 'ml',
      })
      const lonelyCity = await testData.createRegion(payload, {
        name: 'Lonely City',
        level: 'city',
        parent: lonelyCountry.id,
      })
      const created = await submit({ ...baseSubmission, anchorRegion: lonelyCity.id })

      await runScreening(created.id)

      expect(sendEmail).toHaveBeenCalledTimes(1)
      expect((sendEmail.mock.calls[0][0] as { to: string }).to).toBe('contact@sydevelopers.com')
    })
  })

  describe('proposed patch validation', () => {
    it('rejects a key that is not an Events field, naming it', async () => {
      await expect(
        submit({ ...baseSubmission, country: countryId, notAnEventField: 'x' }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('refuses to let a submitter set a system-managed or privileged field', async () => {
      // The whole reason the gate exists: `proposed` is applied to Events
      // verbatim on Accept, so an anonymous POST that could set these would
      // mint a verified, adopted listing. Posted as the literal wire body —
      // going through `toBody` would hoist `region` out of the patch and
      // quietly test nothing.
      const forge = (proposed: Record<string, unknown>) =>
        payload.create({
          collection: 'event-submissions',
          data: {
            submitterInfo: { name: 'Forger', email: 'forger@example.com' },
            regionHint: { country: countryId },
            proposed: { eventType: 'offline', ...proposed },
          } as never,
          overrideAccess: true,
          req: clientReq(VALID_TURNSTILE),
        })

      for (const forged of [
        { verificationStage: 'verified' },
        { manager: 1 },
        { region: cityId },
        { _status: 'published' },
        // Registration is the event's data-collection surface: this one would
        // forward every registrant's name, email and answers to an inbox of
        // the submitter's choosing, from the moment a manager accepted.
        { registrationNotificationEmail: 'attacker@evil.test' },
        // And this one would send every would-be registrant off-site.
        { registrationMode: 'external', externalRegistrationUrl: 'https://evil.test' },
        // Forged history.
        { createdAt: '2020-01-01T00:00:00.000Z' },
      ]) {
        await expect(forge(forged)).rejects.toMatchObject({ status: 400 })
      }
    })

    it('pins the exact set of proposable Events fields', () => {
      // A snapshot of the intake's whole attack surface, against the real
      // Events config. Adding a field to Events fails this test until someone
      // decides, explicitly, whether an anonymous submitter may propose it —
      // which is the only way a privileged field cannot be forgotten.
      const allowed = [
        ...proposableEventFields(payload.collections.events.config.flattenedFields),
      ].sort()
      expect(allowed).toEqual([
        'address',
        'contactEmail',
        'contactName',
        'contactPhone',
        'description',
        'eventType',
        'inactive',
        'languages',
        'onlineUrl',
        'schedule',
        'title',
        'website',
      ])
    })

    it('stores an accepted patch verbatim, keyed by Events field names', async () => {
      const created = await submit({
        ...baseSubmission,
        country: countryId,
        contactPhone: '+44 20 7777 0000',
      })
      const fresh = await reload(created.id)
      expect(fresh.proposed).toMatchObject({
        eventType: 'offline',
        contactPhone: '+44 20 7777 0000',
      })
    })
  })

  describe('submission title', () => {
    it('names a new-event submission with the title the event would be given', async () => {
      // Composed through `autoEventTitle` — the same path the Events title hook
      // runs — so the label a reviewer approves is the title they end up with.
      const created = await submit({
        ...baseSubmission,
        country: countryId,
        address: { city: 'Novo Selo', street: '1 Main St', venueName: 'Riverside Hall' },
      })
      expect(created.title).toBe('New Event: Meditation at Riverside Hall')
    })

    it('prefers a title the submitter supplied, as Events would', async () => {
      const created = await submit({
        ...baseSubmission,
        country: countryId,
        title: 'Sunrise Meditation Circle',
      })
      expect(created.title).toBe('New Event: Sunrise Meditation Circle')
    })

    it('names an update proposal after its target event', async () => {
      const target = await testData.createEvent(payload, {
        title: 'Morning Meditation at World Tree',
        _status: 'published',
      })
      const { address: _a, ...noAddress } = baseSubmission
      const created = await submit({ ...noAddress, event: target.id })
      expect(created.title).toBe('Update Event: Morning Meditation at World Tree')
    })

    it('degrades to the bare prefix rather than guessing', async () => {
      // An online submission with no address and no anchor has nothing to name
      // the event after. Screening resolves a region only afterwards.
      const { address: _a, ...noAddress } = baseSubmission
      const created = await submit({
        ...noAddress,
        country: countryId,
        eventType: 'online',
        onlineUrl: 'https://meet.example.test/abc',
      })
      expect(created.title).toBe('New Event')
    })
  })

  describe('restricted access', () => {
    const clientUser = {
      id: 1,
      collection: 'clients',
      roles: ['sahaj-atlas-client'],
      _status: 'published',
    } as never

    it('clients can create submissions but never read them back', () => {
      expect(
        hasPermission({ user: clientUser, collection: 'event-submissions', operation: 'create' }),
      ).toBe(true)
      expect(
        hasPermission({ user: clientUser, collection: 'event-submissions', operation: 'read' }),
      ).toBe(false)
    })

    it('clients cannot read registrants (users) either — the shared-read hole is closed', () => {
      expect(hasPermission({ user: clientUser, collection: 'users', operation: 'read' })).toBe(
        false,
      )
    })

    it('atlas managers keep explicit read on both restricted collections', () => {
      const managerUser = {
        id: 2,
        collection: 'managers',
        type: 'manager',
        roles: { en: ['atlas-manager'] },
      } as never
      expect(
        hasPermission({
          user: managerUser,
          collection: 'event-submissions',
          operation: 'read',
          locale: 'en',
        }),
      ).toBe(true)
      expect(
        hasPermission({ user: managerUser, collection: 'users', operation: 'read', locale: 'en' }),
      ).toBe(true)
    })
  })
})
