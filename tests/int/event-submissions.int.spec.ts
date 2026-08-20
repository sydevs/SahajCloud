/**
 * Integration tests for the EventSubmissions intake (write-guard plugin →
 * prepareSubmission gates → ScreenEventSubmissions job → applyReview op).
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
vi.mock('@/jobs/ScreenEventSubmissions/emailChecks', () => ({
  hasMxRecords: mxMock,
}))
vi.mock('@/lib/mapbox/geocoder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mapbox/geocoder')>()),
  resolveRegionLocation: geocodeMock,
}))

// Imported after the mocks so the modules pick up the stubs.
const { ScreenEventSubmissions } =
  await import('@/jobs/ScreenEventSubmissions/ScreenEventSubmissions')
const { applyReview } = await import('@/collections/EventSubmissions/lifecycle/review')

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
   * `regionHint`; these specs describe a submission flatly because that reads
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
      ]) {
        await expect(forge(forged)).rejects.toMatchObject({ status: 400 })
      }
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

  describe('review projections', () => {
    it('diffs the proposal against its target and previews the result', async () => {
      const target = await testData.createEvent(payload, {
        contactPhone: '+44 20 0000 1111',
        _status: 'published',
      })
      const { address: _a, ...noAddress } = baseSubmission
      const created = await submit({
        ...noAddress,
        event: target.id,
        contactPhone: '+44 20 2222 3333',
      })

      const fresh = await reload(created.id)
      const changes = fresh.proposedChanges as {
        label: string
        before: string | null
        after: string | null
      }[]
      const phone = changes.find((change) => change.label === 'Contact Phone Number')
      expect(phone).toMatchObject({ before: '+44 20 0000 1111', after: '+44 20 2222 3333' })

      // The preview is the merged event — the target's title survives, the
      // proposal's phone number wins.
      const preview = fresh.previewEvent as Record<string, unknown>
      expect(preview.title).toBe(target.title)
      expect(preview.contactPhone).toBe('+44 20 2222 3333')
    })

    it('skips both projections on a list read', async () => {
      // 25 rows would otherwise mean 25 event lookups for values no list
      // column renders.
      await submit({ ...baseSubmission, country: countryId })
      const list = await payload.find({
        collection: 'event-submissions',
        limit: 1,
        overrideAccess: true,
      })
      expect(list.docs[0]?.proposedChanges).toBeNull()
      expect(list.docs[0]?.previewEvent).toBeNull()
    })
  })

  describe('applyReview', () => {
    it('accept on a new-event submission creates a published unverified event', async () => {
      const created = await submit({
        ...baseSubmission,
        anchorRegion: cityId,
        description: 'A weekly meditation class.\nAll welcome.',
        // The real `scheduleFields` shape. The widget now sends this directly —
        // there is no simplified one-off/weekly vocabulary to translate, so
        // whatever arrives here is what Events validates on Accept.
        schedule: {
          firstDate: '2026-09-01T17:30:00.000Z',
          firstDate_tz: 'Europe/London',
          recurrenceType: 'WEEKLY',
          interval: 1,
          weekdays: ['TU'],
        },
      })
      await payload.update({
        collection: 'event-submissions',
        id: created.id,
        data: { region: cityId, status: 'pending' },
        overrideAccess: true,
      })

      const result = await applyReview({
        payload,
        submissionId: created.id,
        action: 'accept',
        managerId: regionManager.id,
      })
      expect(result.status).toBe('created')
      expect(result.eventId).toBeTruthy()

      const event = await payload.findByID({
        collection: 'events',
        id: result.eventId as number,
        overrideAccess: true,
        depth: 0,
      })
      expect(event.verificationStage).toBe('unverified')
      expect(event._status).toBe('published')
      expect(event.manager ?? null).toBeNull()
      expect(event.schedule?.recurrenceType).toBe('WEEKLY')

      const after = await reload(created.id)
      expect(after.status).toBe('created')
      expect(typeof after.event === 'object' ? after.event?.id : after.event).toBe(result.eventId)
      expect(typeof after.reviewedBy === 'object' ? after.reviewedBy?.id : after.reviewedBy).toBe(
        regionManager.id,
      )
    })

    it('accept on an update proposal patches the event and re-verifies it', async () => {
      const eventManager = await testData.createManager(payload, {
        email: 'patched-manager@example.com',
      })
      const event = await testData.createEvent(payload, {
        manager: eventManager.id,
        _status: 'published',
        contactPhone: '+1-555-0100',
      })
      // Age the stage so the re-verify is observable.
      await payload.update({
        collection: 'events',
        id: event.id,
        data: { verificationStage: 'reminded' },
        context: { skipVerifyHook: true },
      })

      const { address: _address, ...updateBase } = baseSubmission
      const created = await submit({
        ...updateBase,
        event: event.id,
        contactPhone: '+44 20 9999 0000',
      })
      const result = await applyReview({
        payload,
        submissionId: created.id,
        action: 'accept',
        managerId: regionManager.id,
      })
      expect(result.status).toBe('updated')

      const after = await payload.findByID({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        depth: 0,
      })
      expect(after.contactPhone).toBe('+44 20 9999 0000')
      // The accept is a manager save: the verify-on-save hook re-opens the cycle.
      expect(after.verificationStage).toBe('verified')
    })

    it('reject shelves the submission without touching any event', async () => {
      const created = await submit({ ...baseSubmission, anchorRegion: cityId })
      const result = await applyReview({
        payload,
        submissionId: created.id,
        action: 'reject',
        managerId: regionManager.id,
      })
      expect(result.status).toBe('rejected')
      expect(result.eventId).toBeUndefined()
    })

    it('is idempotent: a second review reports the terminal status unchanged', async () => {
      const created = await submit({ ...baseSubmission, anchorRegion: cityId })
      await applyReview({
        payload,
        submissionId: created.id,
        action: 'reject',
        managerId: regionManager.id,
      })
      const again = await applyReview({
        payload,
        submissionId: created.id,
        action: 'accept',
        managerId: regionManager.id,
      })
      expect(again.status).toBe('rejected')
      expect(again.eventId).toBeUndefined()
    })

    it('refuses to accept a new event with no resolved region', async () => {
      const created = await submit({ ...baseSubmission, country: countryId })
      await expect(
        applyReview({
          payload,
          submissionId: created.id,
          action: 'accept',
          managerId: regionManager.id,
        }),
      ).rejects.toMatchObject({ status: 409, data: { code: 'region_unresolved' } })
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
