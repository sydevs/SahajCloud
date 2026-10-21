/**
 * The proposal review lifecycle on `user-submissions` (#796, #909): the two
 * read-only projections a reviewer works from, and every review decision as the
 * admin now makes one — by moving `status` on the document form.
 *
 * ⚠ **The subject is `payload.update` as a manager, not `applyReview`.** #909
 * deleted `POST /api/user-submissions/:id/review` and put the whole decision on
 * the collection's own hooks: `guardStatusTransition` judges the move,
 * `applyReviewDecision` applies it. Calling the lifecycle function directly
 * would test neither, and both are where the refusals now live — so each case
 * posts the transition the button posts.
 *
 * Both hooks bind a **manager's** write and nothing else, which is why every
 * case here passes `user`. A write with no user is a system write (screening,
 * delivery) and passes untouched — `screen-submissions.int.spec.ts` holds that
 * side.
 *
 * Rows are created with `overrideAccess: true` rather than through a client key.
 * The write guard, the per-type gates and screening are
 * `user-submissions-create.int.spec.ts`'s subject, and nothing here depends on
 * them — so this file needs no external stubs at all.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { reviewMove } from '@/collections/UserSubmissions/lifecycle/review'
import {
  OPEN_REVIEW_STATUSES,
  REOPENABLE_REVIEW_STATUSES,
} from '@/collections/UserSubmissions/statuses'
import type { WorkflowButtonsProps } from '@/components/admin/WorkflowButtons/stages'
import { relationId } from '@/lib/utilities/relationId'
import type { Manager, UserSubmission } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('User submission review lifecycle', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let regionManager: Manager
  let countryId: number
  let cityId: number
  let secondCityId: number

  /** The patch a plain offline proposal carries, unless a case needs another. */
  const BASE_PROPOSED = {
    eventType: 'offline',
    address: { city: 'Novo Selo', street: '1 Main St' },
  }

  /**
   * The same proposal at another street, for a case that Accepts a scheduled
   * one: a second class at the same street, schedule and city is refused as a
   * duplicate, so each accepted class needs a street of its own.
   */
  const proposedAt = (street: string) => ({
    ...BASE_PROPOSED,
    address: { ...BASE_PROPOSED.address, street },
  })

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

  /**
   * The write a review button posts: a status move, as the reviewing manager.
   *
   * `user` is the whole reason this is not an ordinary update — both review
   * hooks bind `req.user.collection === 'managers'`, and `createLocalReq` would
   * otherwise leave `collection` to a fallback rather than to this spec.
   * `data` carries anything the reviewer edited in the same post.
   */
  const decide = (
    id: number,
    status: UserSubmission['status'],
    data: Record<string, unknown> = {},
  ) =>
    payload.update({
      collection: 'user-submissions',
      id,
      data: { status, ...data } as never,
      user: { ...regionManager, collection: 'managers' } as never,
      overrideAccess: true,
    }) as Promise<UserSubmission>

  /**
   * A system status write — screening's and delivery's shape, with no user.
   * Both review hooks let it through, which is what puts a row at a status this
   * file's cases start from.
   */
  const settle = (id: number, status: UserSubmission['status']) =>
    payload.update({
      collection: 'user-submissions',
      id,
      data: { status },
      overrideAccess: true,
    })

  /** The event a decided proposal ended up pointing at. */
  const acceptedEventId = async (id: number) => relationId((await reload(id)).event)

  /** The decisions recorded on a row, newest last. */
  const reviewEntries = (submission: UserSubmission) =>
    (submission.activityLog ?? []).filter((entry) => entry.type === 'review')

  const lastReviewEntry = (submission: UserSubmission) => reviewEntries(submission).at(-1)

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    // `atlas-manager` is the one role granting `user-submissions: update`, and
    // `reviewMove` reads that grant — a manager without it is not a reviewer,
    // whatever rows name them.
    regionManager = await testData.createManager(payload, {
      name: 'Region Reviewer',
      email: 'region-reviewer@example.com',
      roles: { en: ['atlas-manager'] },
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
    const secondCity = await testData.createRegion(payload, {
      name: 'Sub Town',
      level: 'city',
      parent: countryId,
    })
    secondCityId = secondCity.id
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

    it('populates the target event photographs the widget cannot read for itself', async () => {
      const uploaded = await Promise.all([
        testData.createImage(payload),
        testData.createImage(payload),
      ])
      // Listed highest id first: the lead photo is the editor's choice, not
      // the lowest row. (`readEventImages` owns the ordering, and
      // `atlas-seo.int.spec.ts` pins it both ways round.)
      const [lead, second] = uploaded.sort((a, b) => b.id - a.id)
      const target = await testData.createEvent(payload, {
        images: [lead.id, second.id],
        _status: 'published',
      })
      const created = await createProposal({
        event: target.id,
        proposed: { eventType: 'offline', contactName: 'Aria' },
      })

      const preview = (await reload(created.id)).previewEvent as Record<string, unknown>
      const images = preview.images as { id: number; url: string | null }[]
      // In the editor's order, and carrying a url — the widget holds
      // create-only here (#723), so this projection is the only way a
      // photograph reaches the preview iframe at all.
      expect(images.map((image) => image.id)).toEqual([lead.id, second.id])
      for (const image of images) expect(image.url).toBeTruthy()

      // `region` stays a bare id: `loadTargetEvent` is shared with the diff
      // through the request memo, so populating relationships on that load
      // would change what the reviewer reads.
      expect(typeof preview.region).toBe('number')
    })

    it('previews a new-event proposal with the region Accept writes, and no photographs', async () => {
      const created = await createProposal({
        anchorRegion: cityId,
        proposed: { ...BASE_PROPOSED, schedule: WEEKLY_SCHEDULE },
      })

      const preview = (await reload(created.id)).previewEvent as Record<string, unknown>
      // `images` is privileged, so a proposal can never carry one and there is
      // no target event to inherit any from.
      expect(preview.images).toBeUndefined()
      expect(preview.region).toBe(cityId)

      await decide(created.id, 'accepted')
      const event = await payload.findByID({
        collection: 'events',
        id: (await acceptedEventId(created.id)) as number,
        depth: 0,
        overrideAccess: true,
      })
      // The preview promised a region. Accept has to write that same one.
      expect(event.region).toBe(preview.region)
    })

    it('prefers a set region over the screening hint, as Accept does', async () => {
      const created = await createProposal({ region: countryId, anchorRegion: cityId })

      const preview = (await reload(created.id)).previewEvent as Record<string, unknown>
      expect(preview.region).toBe(countryId)
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

    it('skips both projections on a registration, which names an event too', async () => {
      // The `findMany` guard does not cover this one: a single read of a
      // registration row would still pay an `events` findByID plus a diff over
      // every Events field against an empty proposal. `SendPostEventFollowUps`
      // reads each due row singly, and the feedback page reads twice per vote.
      const target = await testData.createEvent(payload, { _status: 'published' })
      const registration = (await payload.create({
        collection: 'user-submissions',
        data: createData<'user-submissions'>({
          type: 'registration',
          senderEmail: 'aria@example.com',
          event: target.id,
        }),
        overrideAccess: true,
      })) as UserSubmission

      const fresh = await reload(registration.id)
      expect(fresh.proposedChanges).toBeNull()
      expect(fresh.previewEvent).toBeNull()
    })
  })

  describe('live preview', () => {
    const resolve = async (data: Record<string, unknown>) => {
      const { livePreview } = payload.collections['user-submissions']!.config.admin
      if (typeof livePreview?.url !== 'function') {
        throw new Error('expected livePreview.url to be a function')
      }
      return (await livePreview.url({
        data,
        locale: { code: 'en' },
        req: { payload, locale: 'en', context: {} },
      } as unknown as Parameters<typeof livePreview.url>[0])) as string
    }

    it('points a proposal at the atlas preview route', async () => {
      const url = new URL(await resolve({ id: 42, type: 'proposal' }))

      expect(url.pathname).toBe('/preview')
      expect(url.searchParams.get('id')).toBe('42')
      expect(url.searchParams.get('live-preview')).toBeTruthy()
    })

    it.each(['contact', 'subscribe', 'registration'])(
      'sends a %s row to an explanation that fits it',
      async (type) => {
        // A null path is a page, never a closed panel — `livePreviewUrl` cannot
        // return falsy. So the reason has to fit the row: `no-path` would tell
        // whoever opened it to go and fill in a slug.
        const url = new URL(await resolve({ id: 42, type }), 'https://admin.example')

        expect(url.pathname).toBe('/live-preview-unavailable')
        expect(url.searchParams.get('reason')).toBe('not-reviewable')
      },
    )

    it('leaves the panel closed on arrival', () => {
      // The option is collection-wide and cannot branch on `type`, so opening
      // it for the reviewer greets the other three intakes with that
      // explanation page instead.
      const { livePreview } = payload.collections['user-submissions']!.config.admin
      expect(livePreview?.openByDefault).toBeFalsy()
    })
  })

  /**
   * The buttons the admin offers, read off the live declaration.
   *
   * Which statuses carry buttons is derived from the two status sets, so it
   * cannot drift. Where each button *points* is not — `overrides.status` is
   * written at the declaration, and a Reject aimed at `spam` would build the
   * same map and be refused by `reviewMove` at the click. So the targets are
   * pinned against the decision the server would make for them.
   */
  describe('the review buttons', () => {
    const declaration = () => {
      const slot =
        payload.collections['user-submissions']!.config.admin.components?.edit?.SaveButton
      if (typeof slot !== 'object' || slot === null || !('clientProps' in slot)) {
        throw new Error('expected the SaveButton slot to declare clientProps')
      }
      return slot.clientProps as WorkflowButtonsProps<UserSubmission['status']>
    }

    it('gates on the one intake with a review path', () => {
      expect(declaration().onlyWhen).toEqual({ field: 'type', equals: 'proposal' })
      // Every other intake, and the create screen, keep Payload's own button.
      expect(declaration().fallback).toBe('save')
    })

    it('offers buttons at exactly the statuses a decision is still open at', () => {
      const stages = declaration().stages
      expect(Object.keys(stages).sort()).toEqual(
        [...OPEN_REVIEW_STATUSES, ...REOPENABLE_REVIEW_STATUSES, 'accepted'].sort(),
      )
      // A stage with no action, not a missing one: `[]` renders nothing, where
      // an unnamed stage would put Payload's Save button back on a decided row.
      expect(stages.accepted).toEqual([])
    })

    it('aims every button at a move the server would accept', () => {
      const stages = declaration().stages
      for (const [from, buttons] of Object.entries(stages) as [
        UserSubmission['status'],
        NonNullable<
          WorkflowButtonsProps<UserSubmission['status']>['stages'][UserSubmission['status']]
        >,
      ][]) {
        for (const button of buttons) {
          const to = button.overrides.status as UserSubmission['status']
          const move = reviewMove({
            from,
            to,
            type: 'proposal',
            // An admin, so the only thing left for `reviewMove` to judge is the
            // transition — `bypassPermissions` admits them before any role
            // lookup. Whether a given manager holds the grant is the
            // assigned-manager suite's subject, not this one's.
            req: { locale: 'en', user: { collection: 'managers', type: 'admin' } } as never,
          })
          expect(move, `${button.label}: ${from} → ${to}`).toMatchObject({ kind: 'decision' })
        }
      }
    })

    it('leaves every button enabled on a row nobody edited', () => {
      // `WorkflowButtons` disables an action whose `overrides` are empty, the
      // rule Payload's own Save button applies to an unmodified document — so a
      // review button carrying none would be unreachable until something moved.
      for (const buttons of Object.values(declaration().stages)) {
        for (const button of buttons ?? []) {
          expect(Object.keys(button.overrides).length, button.label).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('reopen', () => {
    const shelve = async (status: 'spam' | 'rejected') => {
      const created = await createProposal({ country: countryId })
      await settle(created.id, status)
      return created.id
    }

    it('returns a shelved submission to pending and records the reopening', async () => {
      for (const status of ['spam', 'rejected'] as const) {
        const id = await shelve(status)
        await decide(id, 'pending')

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
      await settle(created.id, 'accepted')

      await expect(decide(created.id, 'pending')).rejects.toMatchObject({
        data: { errors: [{ path: 'status' }] },
      })
      expect((await reload(created.id)).status).toBe('accepted')
    })
  })

  describe('a decision posted on the form', () => {
    it('acts on a failed row — the review email not sending is not a refusal', async () => {
      // ⚠ This is the one status `event-submissions`' own open set had no
      // equivalent for, so porting that set verbatim would have stranded every
      // row whose review email bounced. `failed` means the decision path was
      // fine and the delivery was not.
      const created = await createProposal({ country: countryId })
      await settle(created.id, 'failed')

      await decide(created.id, 'rejected')
      expect((await reload(created.id)).status).toBe('rejected')
    })

    it('accept on a new-event submission creates a published unverified event', async () => {
      const created = await createProposal({
        region: cityId,
        anchorRegion: cityId,
        proposed: {
          ...proposedAt('2 Main St'),
          description: 'A weekly meditation class.\nAll welcome.',
          // The real `scheduleFields` shape. The widget sends this directly —
          // there is no simplified one-off/weekly vocabulary to translate, so
          // whatever arrives here is what Events validates on Accept.
          schedule: WEEKLY_SCHEDULE,
        },
      })

      await decide(created.id, 'accepted')

      const after = await reload(created.id)
      expect(after.status).toBe('accepted')
      const eventId = relationId(after.event)
      expect(eventId).toBeTruthy()

      const event = await payload.findByID({
        collection: 'events',
        id: eventId as number,
        overrideAccess: true,
        depth: 0,
      })
      expect(event.verificationStage).toBe('unverified')
      expect(event._status).toBe('published')
      expect(event.manager ?? null).toBeNull()
      expect(event.schedule?.recurrenceType).toBe('WEEKLY')

      // The decision, and who made it, live on the row's own log. One status
      // for every accept, so this entry is where created-versus-patched is
      // readable at all — which is why no toast had to carry it.
      expect(lastReviewEntry(after)?.managerId).toBe(regionManager.id)
      expect(lastReviewEntry(after)?.cells?.activity).toBe(`Accepted — event #${eventId} created`)
    })

    it('accept with an assigned manager adopts and verifies the created event', async () => {
      // The manager named on the *submission* — not the reviewer, who is
      // `managerId` above and is deliberately not assigned to the event.
      const owner = await testData.createManager(payload, { email: 'adopting@example.com' })
      const created = await createProposal({
        region: cityId,
        manager: owner.id,
        proposed: { ...proposedAt('3 Main St'), schedule: WEEKLY_SCHEDULE },
      })

      await decide(created.id, 'accepted')

      const event = await payload.findByID({
        collection: 'events',
        id: (await acceptedEventId(created.id)) as number,
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
        // ⚠ In the reviewer's own region, because accepting is a manager save:
        // `Events.region`'s `filterOptions` narrows to the saver's owned
        // subtree, and it runs over the merged document even on a patch that
        // never names `region`. A target outside that subtree is refused — the
        // same answer the review endpoint gave, which forwarded the reviewer's
        // `req` too.
        region: cityId,
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
      await decide(created.id, 'accepted')

      const settled = await reload(created.id)
      expect(settled.status).toBe('accepted')
      expect(lastReviewEntry(settled)?.cells?.activity).toBe(
        `Accepted — changes applied to event #${event.id}`,
      )

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

      await decide(created.id, 'accepted')
      const event = await payload.findByID({
        collection: 'events',
        id: (await acceptedEventId(created.id)) as number,
        overrideAccess: true,
      })
      expect((event.address as Record<string, unknown>).smuggled).toBeUndefined()
      expect((event.address as Record<string, unknown>).street).toBe('1 Main St')
    })

    it('reject shelves the submission without touching any event', async () => {
      const created = await createProposal({ anchorRegion: cityId })
      await decide(created.id, 'rejected')

      const after = await reload(created.id)
      expect(after.status).toBe('rejected')
      expect(relationId(after.event)).toBeNull()
      expect(lastReviewEntry(after)?.cells?.activity).toBe('Rejected')
    })

    it('uses a region the reviewer corrected in the same post', async () => {
      // The one edit a reviewer makes on this page, and the reason Accept is a
      // form submit rather than a button that posts an action: screening can
      // resolve the wrong city, and fixing it must not be a second save.
      const created = await createProposal({
        anchorRegion: cityId,
        proposed: { ...proposedAt('7 Main St'), schedule: WEEKLY_SCHEDULE },
      })

      await decide(created.id, 'accepted', { region: secondCityId })

      const event = await payload.findByID({
        collection: 'events',
        id: (await acceptedEventId(created.id)) as number,
        depth: 0,
        overrideAccess: true,
      })
      expect(event.region).toBe(secondCityId)
    })

    /**
     * What replaced `applyReview`'s own `already-decided` answer, which
     * reported the terminal status with a 200 and wrote nothing. A move no
     * reviewer may make is now refused outright, so nothing has to read an
     * outcome word to find out whether anything happened.
     */
    it.each([
      ['rejected', 'accepted'],
      ['accepted', 'pending'],
      ['pending', 'spam'],
    ] as const)('refuses the move from %s to %s', async (from, to) => {
      const created = await createProposal({ region: cityId, anchorRegion: cityId })
      if (from !== 'pending') await settle(created.id, from)

      await expect(decide(created.id, to)).rejects.toMatchObject({
        data: { errors: [{ path: 'status' }] },
      })
      const after = await reload(created.id)
      expect(after.status).toBe(from)
      expect(reviewEntries(after)).toHaveLength(0)
    })

    /**
     * Refused on `region`, not with a 409 nothing renders: the field is on the
     * page the reviewer is looking at, and it is the field that fixes this.
     */
    it('refuses to accept a new event with no resolved region, and writes none', async () => {
      const created = await createProposal({ country: countryId })
      const before = await payload.count({ collection: 'events', overrideAccess: true })

      await expect(decide(created.id, 'accepted')).rejects.toMatchObject({
        data: { errors: [{ path: 'region' }] },
      })

      expect((await reload(created.id)).status).toBe('pending')
      expect((await payload.count({ collection: 'events', overrideAccess: true })).totalDocs).toBe(
        before.totalDocs,
      )
    })

    /**
     * The same refusal reached by clearing a resolved region, which the form
     * posts as `region: null` — where the case above never had one. No
     * `anchorRegion` either, so nothing is left for `submissionRegionId` to
     * fall back to.
     */
    it('refuses an accept that clears the resolved region in the same post', async () => {
      const created = await createProposal({ region: cityId })
      const before = await payload.count({ collection: 'events', overrideAccess: true })

      await expect(decide(created.id, 'accepted', { region: null })).rejects.toMatchObject({
        data: { errors: [{ path: 'region' }] },
      })

      expect((await reload(created.id)).status).toBe('pending')
      expect((await payload.count({ collection: 'events', overrideAccess: true })).totalDocs).toBe(
        before.totalDocs,
      )
    })
  })

  /**
   * ⚠ **Being assigned a proposal is not authority to decide it.**
   *
   * The deleted endpoint gated on the `user-submissions: update` **grant**
   * alone. A plain `PATCH` is wider: when the role grants deny,
   * `createAccessConfig` falls back to document-level manager access, and this
   * collection has a `manager` field — so whoever it names may edit the row
   * with no grant at all. Reading the collection's `update` to decide who may
   * review would have turned that into authority to publish the Events row an
   * accept writes, with `overrideAccess: true` behind it. `reviewMove` reads
   * the grant instead.
   */
  describe('a manager named on the row but holding no grant', () => {
    let assignee: Manager
    let assigneeDecide: (id: number, status: UserSubmission['status']) => Promise<unknown>

    beforeAll(async () => {
      // Roles that touch neither `user-submissions` nor `events`.
      assignee = await testData.createManager(payload, {
        email: 'assigned-no-grant@example.com',
        roles: { en: ['meditations-editor'] },
      })
      assigneeDecide = (id, status) =>
        payload.update({
          collection: 'user-submissions',
          id,
          data: { status } as never,
          user: { ...assignee, collection: 'managers' } as never,
          overrideAccess: true,
        })
    })

    it('cannot accept it, and no event is written', async () => {
      const created = await createProposal({
        region: cityId,
        anchorRegion: cityId,
        manager: assignee.id,
        proposed: { ...proposedAt('11 Main St'), schedule: WEEKLY_SCHEDULE },
      })
      const before = await payload.count({ collection: 'events', overrideAccess: true })

      await expect(assigneeDecide(created.id, 'accepted')).rejects.toMatchObject({
        data: { errors: [{ path: 'status' }] },
      })

      expect((await reload(created.id)).status).toBe('pending')
      expect((await payload.count({ collection: 'events', overrideAccess: true })).totalDocs).toBe(
        before.totalDocs,
      )
    })

    it('cannot reject it either — the refusal is about the grant, not the move', async () => {
      const created = await createProposal({ region: cityId, manager: assignee.id })

      await expect(assigneeDecide(created.id, 'rejected')).rejects.toMatchObject({
        data: { errors: [{ path: 'status' }] },
      })
      expect((await reload(created.id)).status).toBe('pending')
    })
  })

  /**
   * One table, four intakes, one status vocabulary. `onlyWhen` keeps the review
   * buttons off the other three in the admin; this is the half a forged
   * `PATCH /api/user-submissions/:id` meets, which no button can enforce.
   */
  describe('the three intakes with no review path', () => {
    let contactFormId: number

    beforeAll(async () => {
      const form = await payload.create({
        collection: 'forms',
        data: {
          title: 'Report an issue',
          actionType: 'contact',
          recipient: regionManager.id,
          // `confirmationMessage` is required under the default `message`
          // confirmation type; a redirect sidesteps building Lexical.
          confirmationType: 'redirect',
          redirect: { url: '/thanks' },
          fields: [
            { blockType: 'email', name: 'email', label: 'Email' },
            { blockType: 'textarea', name: 'message', label: 'Message' },
          ],
        } as never,
        overrideAccess: true,
      })
      contactFormId = form.id
    })

    /**
     * One row per intake, each in the shape its own gates accept: `contact`
     * owes a `contact` form (`prepareUserSubmission` matches the form's
     * `actionType` to the type), and `subscribe` names an event instead, which
     * is the shape a registration spawns and the one that owes no form.
     */
    const createIntake = async (type: 'contact' | 'registration' | 'subscribe') => {
      const target =
        type === 'subscribe' ? await testData.createEvent(payload, { _status: 'published' }) : null
      const created = (await payload.create({
        collection: 'user-submissions',
        data: createData<'user-submissions'>({
          type,
          senderEmail: 'aria@example.com',
          ...(type === 'contact' ? { form: contactFormId } : {}),
          ...(target ? { event: target.id } : {}),
        }),
        overrideAccess: true,
      })) as UserSubmission
      return created.id
    }

    it.each(['contact', 'registration', 'subscribe'] as const)(
      'refuses a manager moving a %s row’s status',
      async (type) => {
        const id = await createIntake(type)

        await expect(decide(id, 'accepted')).rejects.toMatchObject({
          data: { errors: [{ path: 'status' }] },
        })
        expect((await reload(id)).status).toBe('pending')
      },
    )

    it.each(['contact', 'registration', 'subscribe'] as const)(
      'lets an ordinary save through on a %s row',
      async (type) => {
        // The form posts the whole document, so every save re-posts the stored
        // status. A guard reading that as a transition would refuse every edit
        // on three of the four intakes.
        const id = await createIntake(type)

        await decide(id, 'pending', { subject: 'Edited by a manager' })
        expect((await reload(id)).subject).toBe('Edited by a manager')
      },
    )
  })
})
