/**
 * The proposal review lifecycle on `user-submissions` (#796): the two read-only
 * projections a reviewer works from, reopening a shelved row, and `applyReview`
 * itself.
 *
 * Ported from `event-submissions.int.spec.ts` with the code. Two semantics moved
 * with it, and the assertions follow the new ones rather than the old names:
 * the status vocabulary collapsed to five, so what an accept *did* is
 * `ReviewResult.outcome` and no longer the status; and a decision is recorded as
 * an `activityLog` entry of `type: 'review'` rather than a `reviewedBy` /
 * `reviewedAt` pair.
 *
 * Rows are created with `overrideAccess: true` rather than through a client key.
 * The write guard, the per-type gates and screening are
 * `user-submissions-create.int.spec.ts`'s subject, and nothing here depends on
 * them — so this file needs no external stubs at all.
 *
 * The REST-layer half of the review path — the locale gate and the 409 for a
 * non-proposal row — lives in `user-submissions-review.int.spec.ts`.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyReview } from '@/collections/UserSubmissions/lifecycle/review'
import type { Manager, UserSubmission } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('User submission review lifecycle', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let regionManager: Manager
  let countryId: number
  let cityId: number

  /** The patch a plain offline proposal carries, unless a case needs another. */
  const BASE_PROPOSED = {
    eventType: 'offline',
    address: { city: 'Novo Selo', street: '1 Main St' },
  }

  /** The `scheduleFields` shape the widget sends, for a case that needs one. */
  const WEEKLY_SCHEDULE = {
    firstDate: '2026-09-01T17:30:00.000Z',
    firstDate_tz: 'Europe/London',
    recurrenceType: 'WEEKLY',
    interval: 1,
    weekdays: ['TU'],
  }

  /**
   * A `proposal` row, as the intake leaves one: the Events patch under
   * `proposed`, the submitter's address, and the targeting the widget sent.
   * `region` / `manager` are what screening resolved or a reviewer set, so they
   * are passed flat rather than buried in the patch — `validateProposal` refuses
   * either one inside it.
   */
  const createProposal = async (
    fixture: {
      proposed?: Record<string, unknown>
      event?: number
      region?: number
      manager?: number
      anchorRegion?: number
      country?: number
    } = {},
  ): Promise<UserSubmission> => {
    const { proposed = BASE_PROPOSED, event, region, manager, anchorRegion, country } = fixture

    return (await payload.create({
      collection: 'user-submissions',
      data: createData<'user-submissions'>({
        type: 'proposal',
        senderEmail: 'aria@example.com',
        proposed,
        regionHint: {
          ...(country != null ? { country } : {}),
          ...(anchorRegion != null ? { anchorRegion } : {}),
        },
        ...(event != null ? { event } : {}),
        ...(region != null ? { region } : {}),
        ...(manager != null ? { manager } : {}),
      }),
      overrideAccess: true,
    })) as UserSubmission
  }

  const reload = (id: number) =>
    payload.findByID({
      collection: 'user-submissions',
      id,
      depth: 0,
      overrideAccess: true,
    }) as Promise<UserSubmission>

  /** The decisions recorded on a row, newest last. */
  const reviewEntries = (submission: UserSubmission) =>
    (submission.activityLog ?? []).filter((entry) => entry.type === 'review')

  const lastReviewEntry = (submission: UserSubmission) => reviewEntries(submission).at(-1)

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

  describe('review projections', () => {
    it('diffs the proposal against its target and previews the result', async () => {
      const target = await testData.createEvent(payload, {
        contactPhone: '+44 20 0000 1111',
        _status: 'published',
      })
      const created = await createProposal({
        event: target.id,
        proposed: { eventType: 'offline', contactPhone: '+44 20 2222 3333' },
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
      await createProposal({ country: countryId })
      const list = await payload.find({
        collection: 'user-submissions',
        limit: 1,
        overrideAccess: true,
      })
      expect(list.docs[0]?.proposedChanges).toBeNull()
      expect(list.docs[0]?.previewEvent).toBeNull()
    })
  })

  describe('reopen', () => {
    const shelve = async (status: 'spam' | 'rejected') => {
      const created = await createProposal({ country: countryId })
      await payload.update({
        collection: 'user-submissions',
        id: created.id,
        data: { status },
        overrideAccess: true,
      })
      return created.id
    }

    it('returns a shelved submission to pending and records the reopening', async () => {
      for (const status of ['spam', 'rejected'] as const) {
        const id = await shelve(status)
        const result = await applyReview({
          payload,
          submissionId: id,
          action: 'reopen',
          managerId: regionManager.id,
        })
        expect(result.status).toBe('pending')
        expect(result.outcome).toBe('reopened')

        const fresh = await reload(id)
        expect(fresh.status).toBe('pending')
        // The row is genuinely awaiting a decision again, and the log says who
        // put it back rather than attributing a decision to them.
        expect(lastReviewEntry(fresh)?.cells?.activity).toBe('Reopened for review')
        expect(lastReviewEntry(fresh)?.managerId).toBe(regionManager.id)
      }
    })

    it('refuses to reopen a submission that already wrote to an event', async () => {
      // Reopening an accepted row would invite a second Accept, and a duplicate
      // listing with it.
      const created = await createProposal({ country: countryId })
      await payload.update({
        collection: 'user-submissions',
        id: created.id,
        data: { status: 'accepted' },
        overrideAccess: true,
      })
      await expect(
        applyReview({
          payload,
          submissionId: created.id,
          action: 'reopen',
          managerId: regionManager.id,
        }),
      ).rejects.toMatchObject({ status: 409, data: { code: 'not_reopenable' } })
    })
  })

  describe('applyReview', () => {
    it('acts on a failed row — the review email not sending is not a refusal', async () => {
      // ⚠ This is the one status `event-submissions`' own open set had no
      // equivalent for, so porting that set verbatim would have stranded every
      // row whose review email bounced. `failed` means the decision path was
      // fine and the delivery was not.
      const created = await createProposal({ country: countryId })
      await payload.update({
        collection: 'user-submissions',
        id: created.id,
        data: { status: 'failed' },
        overrideAccess: true,
      })

      const result = await applyReview({
        payload,
        submissionId: created.id,
        action: 'reject',
        managerId: regionManager.id,
      })
      expect(result.status).toBe('rejected')
      expect(result.outcome).toBe('rejected')
    })

    it('accept on a new-event submission creates a published unverified event', async () => {
      const created = await createProposal({
        region: cityId,
        anchorRegion: cityId,
        proposed: {
          ...BASE_PROPOSED,
          description: 'A weekly meditation class.\nAll welcome.',
          // The real `scheduleFields` shape. The widget sends this directly —
          // there is no simplified one-off/weekly vocabulary to translate, so
          // whatever arrives here is what Events validates on Accept.
          schedule: WEEKLY_SCHEDULE,
        },
      })

      const result = await applyReview({
        payload,
        submissionId: created.id,
        action: 'accept',
        managerId: regionManager.id,
      })
      // One status for every accept; `outcome` is what the accept actually did.
      expect(result.status).toBe('accepted')
      expect(result.outcome).toBe('created')
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
      expect(after.status).toBe('accepted')
      expect(typeof after.event === 'object' ? after.event?.id : after.event).toBe(result.eventId)
      // The decision, and who made it, live on the row's own log.
      expect(lastReviewEntry(after)?.managerId).toBe(regionManager.id)
      expect(lastReviewEntry(after)?.cells?.activity).toBe(
        `Accepted — event #${result.eventId} created`,
      )
    })

    it('accept with an assigned manager adopts and verifies the created event', async () => {
      // The manager named on the *submission* — not the reviewer, who is
      // `managerId` above and is deliberately not assigned to the event.
      const owner = await testData.createManager(payload, { email: 'adopting@example.com' })
      const created = await createProposal({
        region: cityId,
        manager: owner.id,
        proposed: { ...BASE_PROPOSED, schedule: WEEKLY_SCHEDULE },
      })

      const result = await applyReview({
        payload,
        submissionId: created.id,
        action: 'accept',
        managerId: regionManager.id,
      })

      const event = await payload.findByID({
        collection: 'events',
        id: result.eventId as number,
        overrideAccess: true,
        depth: 0,
      })
      expect(event.manager).toBe(owner.id)
      expect(event.verificationStage).toBe('verified')
      // The point of letting the verify hook run rather than stamping the
      // stage ourselves: a verified event with no watermark would never come
      // up for re-verification again.
      expect(event.nextCheckAt).toBeTruthy()
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

      const created = await createProposal({
        event: event.id,
        proposed: { eventType: 'offline', contactPhone: '+44 20 9999 0000' },
      })
      const result = await applyReview({
        payload,
        submissionId: created.id,
        action: 'accept',
        managerId: regionManager.id,
      })
      expect(result.status).toBe('accepted')
      expect(result.outcome).toBe('updated')

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

    it('does not carry an unknown nested key through to the event', async () => {
      // Validation is top-level only: a group's subfields are not individually
      // checked. Payload drops unknown keys on the way into Events, but that
      // is its behaviour, not ours — pin it, so a future change that starts
      // honouring nested keys cannot quietly widen the intake.
      const created = await createProposal({
        region: cityId,
        country: countryId,
        proposed: {
          eventType: 'offline',
          address: { city: 'Novo Selo', street: '1 Main St', smuggled: 'nope' },
          // No schedule ⇒ Accept creates a dormant listing, and Events requires
          // a contact route on one. See `newEventDefaults`.
          contactPhone: '+44 20 7000 0000',
        },
      })

      const result = await applyReview({
        payload,
        submissionId: created.id,
        action: 'accept',
        managerId: regionManager.id,
      })
      const event = await payload.findByID({
        collection: 'events',
        id: result.eventId as number,
        overrideAccess: true,
      })
      expect((event.address as Record<string, unknown>).smuggled).toBeUndefined()
      expect((event.address as Record<string, unknown>).street).toBe('1 Main St')
    })

    it('reject shelves the submission without touching any event', async () => {
      const created = await createProposal({ anchorRegion: cityId })
      const result = await applyReview({
        payload,
        submissionId: created.id,
        action: 'reject',
        managerId: regionManager.id,
      })
      expect(result.status).toBe('rejected')
      expect(result.outcome).toBe('rejected')
      expect(result.eventId).toBeUndefined()
    })

    it('is idempotent: a second review reports the terminal status unchanged', async () => {
      const created = await createProposal({ anchorRegion: cityId })
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
      expect(again.outcome).toBe('already-decided')
      expect(again.eventId).toBeUndefined()
      // Nothing was written the second time round, so the log still holds one
      // decision — which is what "already decided" has to mean.
      expect(reviewEntries(await reload(created.id))).toHaveLength(1)
    })

    it('refuses to accept a new event with no resolved region', async () => {
      const created = await createProposal({ country: countryId })
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
})
