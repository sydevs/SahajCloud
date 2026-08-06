import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { verifyEventAction } from '@/collections/Events/endpoints/verifyEventAction'
import { verifyEventFromToken } from '@/collections/Events/lifecycle/verify'
import { ExpireEvents } from '@/jobs/ExpireEvents/ExpireEvents'
import type { NotificationLogEntry } from '@/lib/eventVerification/log'
import { signVerifyToken } from '@/lib/eventVerification/token'
import type { Event, Manager } from '@/payload-types'

import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * End-to-end coverage for the event verification lifecycle (#484): the
 * ExpireEvents job's stage machine + per-recipient log/resume, the
 * verify-on-save hook, and the explicit verify endpoints. Pure helpers
 * (period map, stage offsets, finished-check, token, email render) are unit
 * tested separately.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString()
const inDays = (n: number) => new Date(Date.now() + n * DAY_MS).toISOString()

const runJob = (payload: Payload) => runTaskHandler(ExpireEvents, { payload })

/** Back-date an event's nextCheckAt so the next run treats it as due. */
async function makeDue(payload: Payload, id: number): Promise<void> {
  await payload.update({
    collection: 'events',
    id,
    data: { nextCheckAt: daysAgo(1) },
    context: { skipVerifyHook: true },
    overrideAccess: true,
  })
}

async function getEvent(payload: Payload, id: number, trash = false): Promise<Event> {
  return payload.findByID({ collection: 'events', id, overrideAccess: true, trash })
}

function reminders(
  log: Event['notificationLog'],
): Extract<NotificationLogEntry, { kind: 'reminder' }>[] {
  const entries = Array.isArray(log) ? (log as NotificationLogEntry[]) : []
  return entries.filter(
    (e): e is Extract<NotificationLogEntry, { kind: 'reminder' }> => e.kind === 'reminder',
  )
}

describe('Event verification lifecycle', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUser: Manager
  let eventManager: Manager
  let defaultRegion: { id: number }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUser = env.adminUser
    eventManager = await testData.createManager(payload, {
      name: 'Event Manager',
      email: 'event-manager@example.com',
      notificationPreferences: { event_verification: { frequency: 'Monthly', method: 'email' } },
    })
    defaultRegion = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: createData<'regions'>({
        name: 'Default City',
        level: 'city',
        mapboxId: 'default-city',
        managers: [eventManager.id],
      }),
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  /** `schedule: null` is a local sentinel meaning "omit the group" (inactive events). */
  type EventFixture = Omit<FixtureOverrides<Event>, 'schedule'> & {
    schedule?: FixtureOverrides<Event>['schedule'] | null
  }

  async function createEvent(overrides: EventFixture = {}): Promise<Event> {
    const hasScheduleOverride = 'schedule' in overrides
    const { schedule: scheduleOverride, ...rest } = overrides
    const data: FixtureOverrides<Event> = {
      title: 'Lifecycle Event',
      languages: ['en'],
      eventType: 'online',
      onlineUrl: 'https://example.com/meet',
      registrationMode: 'sahaj-atlas',
      manager: eventManager.id,
      region: defaultRegion.id,
      // Publish on create (the manager's publish action) so the expire →
      // draft flip is observable; the hook leaves _status to the save choice.
      _status: 'published',
      ...rest,
    }
    if (!hasScheduleOverride) {
      data.schedule = {
        firstDate: daysAgo(2),
        firstDate_tz: 'Europe/London',
        recurrenceType: 'DAILY',
        interval: 1,
      }
    } else if (scheduleOverride != null) {
      // A null override omits the schedule entirely (inactive events).
      data.schedule = scheduleOverride
    }
    return payload.create({
      collection: 'events',
      overrideAccess: true,
      data: createData<'events'>(data),
    })
  }

  it('opens a verified, published cycle on create (verify-on-save hook)', async () => {
    const event = await createEvent()
    expect(event.verificationStage).toBe('verified')
    expect(event._status).toBe('published')
    expect(event.nextCheckAt).toBeTruthy()
    const log = Array.isArray(event.notificationLog)
      ? (event.notificationLog as NotificationLogEntry[])
      : []
    expect(log[0]).toMatchObject({ kind: 'verification', method: 're-save' })
  })

  it('drives an event verified → reminded → escalated → urgent → expired → trashed', async () => {
    const region = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: createData<'regions'>({
        name: 'Country LC',
        level: 'country',
        mapboxId: 'lc-country',
        managers: [eventManager.id],
      }),
    })
    const regionManager = await testData.createManager(payload, {
      name: 'Region Manager',
      email: 'region-manager@example.com',
    })
    const city = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: createData<'regions'>({
        name: 'City LC',
        level: 'city',
        mapboxId: 'lc-city',
        parent: region.id,
        managers: [regionManager.id],
      }),
    })
    const event = await createEvent({ region: city.id })

    // verified → reminded: manager only, stays published.
    await makeDue(payload, event.id)
    const r1 = await runJob(payload)
    expect(r1).toMatchObject({ advanced: 1, remindersSent: 1, trashed: 0, finished: 0 })
    let fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('reminded')
    expect(fresh._status).toBe('published')
    const firstReminders = reminders(fresh.notificationLog)
    expect(firstReminders).toHaveLength(1)
    expect(firstReminders[0]).toMatchObject({
      stage: 'verified',
      channel: 'email',
      destination: 'event-manager@example.com',
    })

    // reminded → escalated: adds the region manager.
    await makeDue(payload, event.id)
    const r2 = await runJob(payload)
    expect(r2).toMatchObject({ advanced: 1, remindersSent: 2 })
    fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('escalated')
    expect(fresh._status).toBe('published')
    const escalatedDestinations = reminders(fresh.notificationLog)
      .filter((e) => e.stage === 'reminded')
      .map((e) => e.destination)
      .sort()
    expect(escalatedDestinations).toEqual([
      'event-manager@example.com',
      'region-manager@example.com',
    ])
    // The job records the escalation level + recipient tier (+ linking region).
    const regionEntry = reminders(fresh.notificationLog).find(
      (e) => e.stage === 'reminded' && e.destination === 'region-manager@example.com',
    )
    expect(regionEntry).toMatchObject({ level: 'escalated', role: 'region', region: 'City LC' })
    const managerEntry = reminders(fresh.notificationLog).find(
      (e) => e.stage === 'reminded' && e.destination === 'event-manager@example.com',
    )
    expect(managerEntry).toMatchObject({ level: 'escalated', role: 'manager' })
    expect(managerEntry?.region).toBeUndefined()

    // escalated → urgent: final reminder, region included, still published.
    await makeDue(payload, event.id)
    const r3 = await runJob(payload)
    expect(r3).toMatchObject({ advanced: 1, remindersSent: 2 })
    fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('urgent')
    expect(fresh._status).toBe('published')

    // urgent → expired: unpublishes.
    await makeDue(payload, event.id)
    const r4 = await runJob(payload)
    expect(r4).toMatchObject({ advanced: 1, remindersSent: 2 })
    fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('expired')
    expect(fresh._status).toBe('draft')

    // expired → trashed (no email).
    await makeDue(payload, event.id)
    const r5 = await runJob(payload)
    expect(r5).toMatchObject({ trashed: 1, remindersSent: 0, advanced: 0 })
    const trashed = await getEvent(payload, event.id, true)
    expect(trashed.deletedAt).toBeTruthy()
  })

  describe('webPath / webUrl virtual fields', () => {
    it('exposes the canonical Atlas path + URL for a published event', async () => {
      const event = await createEvent()
      const [fetched, region] = await Promise.all([
        payload.findByID({ collection: 'events', id: event.id, overrideAccess: true }),
        payload.findByID({ collection: 'regions', id: defaultRegion.id, overrideAccess: true }),
      ])
      // "Default City" has no parent → its path is `/<slug>`; the event's path
      // appends its id, and webUrl joins that to the Atlas host.
      expect(region.webPath).toBe(`/${region.slug}`)
      expect(fetched.webPath).toBe(`/${region.slug}/${event.id}`)
      expect(fetched.webUrl).toBe(`http://localhost:5174/${region.slug}/${event.id}`)
      // appUrl is always emitted but null — there's no Atlas app deep-link base.
      expect(fetched.appUrl).toBeNull()
    })

    it('resolves on a direct read that selects only the path fields', async () => {
      // The ensureWebPathDeps beforeOperation hook re-adds `region` / `_status`,
      // so a caller can select webPath/webUrl without their inputs.
      const event = await createEvent()
      const [fetched, region] = await Promise.all([
        payload.findByID({
          collection: 'events',
          id: event.id,
          select: { webPath: true, webUrl: true },
          overrideAccess: true,
        }),
        payload.findByID({ collection: 'regions', id: defaultRegion.id, overrideAccess: true }),
      ])
      expect(fetched.webPath).toBe(`/${region.slug}/${event.id}`)
      expect(fetched.webUrl).toBe(`http://localhost:5174/${region.slug}/${event.id}`)
    })

    it('exposes neither webPath nor webUrl while unpublished', async () => {
      const event = await createEvent()
      await payload.update({
        collection: 'events',
        id: event.id,
        data: { _status: 'draft' },
        context: { skipVerifyHook: true },
        overrideAccess: true,
      })
      const draft = await payload.findByID({
        collection: 'events',
        id: event.id,
        draft: true,
        overrideAccess: true,
      })
      // Both fields are published-gated — an unpublished event has no public page.
      expect(draft.webPath).toBeNull()
      expect(draft.webUrl).toBeNull()
    })
  })

  it('escalates past a region manager who is also the event manager', async () => {
    // The event manager also manages the event's own (city) region. Escalation
    // must skip them — no duplicate email — and walk up to the country manager.
    const country = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: createData<'regions'>({
        name: 'Country DD',
        level: 'country',
        mapboxId: 'dd-country',
        managers: [eventManager.id],
      }),
    })
    const countryManager = await testData.createManager(payload, {
      name: 'Country Manager',
      email: 'country-manager@example.com',
    })
    await payload.update({
      collection: 'regions',
      id: country.id,
      overrideAccess: true,
      data: createData<'regions'>({ managers: [countryManager.id] }),
    })
    const city = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: createData<'regions'>({
        name: 'City DD',
        level: 'city',
        mapboxId: 'dd-city',
        parent: country.id,
        // The event manager is *also* this region's manager.
        managers: [eventManager.id],
      }),
    })
    const event = await createEvent({ region: city.id })

    // verified → reminded (manager only), then reminded → escalated.
    await makeDue(payload, event.id)
    await runJob(payload)
    await makeDue(payload, event.id)
    const r = await runJob(payload)

    // Two recipients: the event manager + the country manager (city manager skipped).
    expect(r).toMatchObject({ advanced: 1, remindersSent: 2 })
    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('escalated')
    const escalatedDestinations = reminders(fresh.notificationLog)
      .filter((e) => e.stage === 'reminded')
      .map((e) => e.destination)
      .sort()
    expect(escalatedDestinations).toEqual([
      'country-manager@example.com',
      'event-manager@example.com',
    ])
  })

  it('re-running immediately sends nothing and advances nothing', async () => {
    const event = await createEvent()
    await makeDue(payload, event.id)
    await runJob(payload) // → reminded, nextCheckAt now in the future

    const before = await getEvent(payload, event.id)
    const second = await runJob(payload)
    const after = await getEvent(payload, event.id)

    // The event isn't due, so it isn't even examined.
    expect(second.remindersSent).toBe(0)
    expect(second.advanced).toBe(0)
    expect(after.verificationStage).toBe(before.verificationStage)
    expect(reminders(after.notificationLog)).toHaveLength(reminders(before.notificationLog).length)
  })

  describe('listing progress in the reminder email (#611)', () => {
    type SentEmail = { to: string; html: string }
    const sent: SentEmail[] = []
    let restore: () => void

    beforeAll(() => {
      // The report is only observable in the rendered message, so capture what
      // the job hands the adapter rather than asserting on the log.
      const original = payload.sendEmail.bind(payload)
      payload.sendEmail = (async (message: Parameters<Payload['sendEmail']>[0]) => {
        sent.push({ to: String(message.to ?? ''), html: String(message.html ?? '') })
        return original(message)
      }) as Payload['sendEmail']
      restore = () => {
        payload.sendEmail = original
      }
    })

    afterAll(() => {
      restore()
    })

    const mailTo = (address: string) => sent.filter((email) => email.to.includes(address))

    /** Run one reminder cycle for `event` and return the manager's email. */
    async function remindOnce(eventId: number): Promise<string> {
      sent.length = 0
      await makeDue(payload, eventId)
      await runJob(payload)
      const [email] = mailTo('event-manager@example.com')
      expect(email).toBeDefined()
      return email.html
    }

    it('tells a thin listing what to improve, in the registry’s own words', async () => {
      const event = await createEvent({ title: 'Sparse Listing' })
      const html = await remindOnce(event.id)

      expect(html).toContain('Your listing')
      // Straight from `EVENT_QUALITY_COPY` — no description, no photos.
      expect(html).toContain('Add a description')
      expect(html).toContain('Add photos')
      // The bar counts what the job actually found, not a hardcoded total.
      expect(html).toMatch(/\d+ of \d+ complete/)
    })

    it('celebrates a listing with nothing left to improve', async () => {
      // Sequential: the three uploads share a source filename, and Payload's
      // collision suffixing races when they land at once.
      const images: number[] = []
      for (const alt of ['Hall one', 'Hall two', 'Hall three']) {
        const image = await testData.createMediaImage(payload, { alt })
        images.push(image.id)
      }
      const event = await createEvent({
        title: 'Evening Sitting for Night-Shift Nurses',
        images,
        description: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'text',
                    text: 'A quiet hour of guided meditation for anyone who works nights. No experience needed, and there is nothing at all to bring.',
                    version: 1,
                  },
                ],
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            version: 1,
          },
        } as never,
      })

      const html = await remindOnce(event.id)
      expect(html).toContain('Nothing left to improve')
      // Every check passed, so the bar is full and nothing is outstanding.
      expect(html).toMatch(/(\d+) of \1 complete/)
      expect(html).not.toContain('Add a description')
      expect(html).not.toContain('Add photos')
    })

    it('sends none for an unpublished event — it was never checked', async () => {
      // Not "no problems found": an invisible listing isn't graded (#609). The
      // reminder itself still goes out, because the ladder doesn't care.
      const event = await createEvent({ title: 'Hidden Listing' })
      await payload.update({
        collection: 'events',
        id: event.id,
        data: { _status: 'draft' },
        context: { skipVerifyHook: true },
        overrideAccess: true,
      })

      const html = await remindOnce(event.id)
      // Nothing at all — not even the celebration a complete listing earns.
      expect(html).not.toContain('Your listing')
      expect(html).not.toContain('complete')
      expect(html).not.toContain('Add a description')
    })

    it('still sends exactly one reminder per recipient when the job runs twice', async () => {
      // The trap this ticket had to avoid: dedup is keyed on stage + manager id
      // via `notificationLog`. If the progress section had perturbed that key, every
      // manager would be re-sent every reminder they'd already had.
      const event = await createEvent({ title: 'Dedup Listing' })
      await remindOnce(event.id)
      expect(mailTo('event-manager@example.com')).toHaveLength(1)

      // Rewind to the stage just sent for, and make it due again — the log
      // entry alone has to stop the second send.
      await payload.update({
        collection: 'events',
        id: event.id,
        data: { verificationStage: 'verified', nextCheckAt: daysAgo(1) },
        context: { skipVerifyHook: true },
        overrideAccess: true,
      })

      const second = await runJob(payload)
      expect(second.remindersSent).toBe(0)
      expect(mailTo('event-manager@example.com')).toHaveLength(1)

      const fresh = await getEvent(payload, event.id)
      expect(reminders(fresh.notificationLog).filter((e) => e.stage === 'verified')).toHaveLength(1)
    })
  })

  it('resumes a partial fan-out by sending only the un-logged recipient', async () => {
    const region = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: createData<'regions'>({
        name: 'Country RS',
        level: 'country',
        mapboxId: 'rs-country',
        managers: [eventManager.id],
      }),
    })
    const regionManager = await testData.createManager(payload, {
      name: 'Resume Region Manager',
      email: 'resume-region@example.com',
    })
    const city = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: createData<'regions'>({
        name: 'City RS',
        level: 'city',
        mapboxId: 'rs-city',
        parent: region.id,
        managers: [regionManager.id],
      }),
    })
    const event = await createEvent({ region: city.id })

    // Simulate a crash mid-fan-out at the escalated stage: the event manager
    // was already logged, but the region manager wasn't.
    await payload.update({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
      context: { skipVerifyHook: true },
      data: {
        verificationStage: 'escalated',
        nextCheckAt: daysAgo(1),
        notificationLog: [
          { kind: 'verification', at: daysAgo(40), by: null, method: 'import' },
          {
            kind: 'reminder',
            stage: 'escalated',
            at: daysAgo(1),
            manager: { id: eventManager.id, name: 'Event Manager' },
            channel: 'email',
            destination: 'event-manager@example.com',
          },
        ] as NotificationLogEntry[],
      },
    })

    const result = await runJob(payload)
    // Only the region manager (still missing) is sent — no duplicate.
    expect(result.remindersSent).toBe(1)
    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('urgent')
    const escalatedDestinations = reminders(fresh.notificationLog)
      .filter((e) => e.stage === 'escalated')
      .map((e) => e.destination)
      .sort()
    expect(escalatedDestinations).toEqual([
      'event-manager@example.com',
      'resume-region@example.com',
    ])
  })

  it('a manager save re-verifies and resets the cycle (method re-save)', async () => {
    const event = await createEvent()
    await makeDue(payload, event.id)
    await runJob(payload) // → reminded
    expect((await getEvent(payload, event.id)).verificationStage).toBe('reminded')

    // A manager edit (no skipVerifyHook) re-opens the cycle.
    await payload.update({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
      data: { title: 'Edited Title' },
    })
    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('verified')
    expect(reminders(fresh.notificationLog)).toHaveLength(0)
    const log = fresh.notificationLog as NotificationLogEntry[]
    expect(log[0]).toMatchObject({ kind: 'verification', method: 're-save' })
  })

  it('the admin verify endpoint re-publishes an expired event (method verify-action)', async () => {
    const event = await createEvent()
    // Drive to expired (verified → reminded → escalated → urgent → expired).
    for (let i = 0; i < 4; i++) {
      await makeDue(payload, event.id)
      await runJob(payload)
    }
    expect((await getEvent(payload, event.id))._status).toBe('draft')

    const req = {
      payload,
      user: { ...adminUser, collection: 'managers' },
      routeParams: { id: String(event.id) },
      query: {},
      headers: new Headers(),
    } as unknown as Parameters<typeof verifyEventAction.handler>[0]
    const res = await verifyEventAction.handler(req)
    expect(res.status).toBe(200)

    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('verified')
    expect(fresh._status).toBe('published')
    const log = fresh.notificationLog as NotificationLogEntry[]
    expect(log[0]).toMatchObject({ kind: 'verification', method: 'verify-action' })
  })

  it('verifyEventFromToken verifies a logged-out event link (method email-link)', async () => {
    const event = await createEvent()
    await makeDue(payload, event.id)
    await runJob(payload) // → reminded

    const token = signVerifyToken({ eventId: event.id, managerId: eventManager.id }, payload.secret)
    const verified = await verifyEventFromToken({ payload, token })

    expect(verified).not.toBeNull()
    expect(verified?.verificationStage).toBe('verified')
    expect(verified?._status).toBe('published')
    const log = (verified as Event).notificationLog as NotificationLogEntry[]
    expect(log[0]).toMatchObject({ kind: 'verification', method: 'email-link' })
    expect((log[0] as Extract<NotificationLogEntry, { kind: 'verification' }>).by?.id).toBe(
      eventManager.id,
    )
  })

  it('verifyEventFromToken returns null for an invalid token, leaving the event unchanged', async () => {
    const event = await createEvent()
    const before = await getEvent(payload, event.id)
    const result = await verifyEventFromToken({ payload, token: 'not-a-valid-token' })
    expect(result).toBeNull()
    const after = await getEvent(payload, event.id)
    expect(after.updatedAt).toBe(before.updatedAt)
  })

  it('marks a run-out (non-inactive) event finished, no email, still published', async () => {
    // One-off event whose only occurrence is past, so `schedule.lastDate` (end of
    // that day, local) is behind us.
    const event = await createEvent({
      schedule: { firstDate: daysAgo(5), firstDate_tz: 'Europe/London' },
    } as Partial<Event>)
    await makeDue(payload, event.id)
    const result = await runJob(payload)

    expect(result.finished).toBe(1)
    expect(result.remindersSent).toBe(0)
    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('finished')
    expect(fresh.nextCheckAt ?? null).toBeNull()
    // #603 inverted this: finishing no longer unpublishes. The event's Atlas page
    // must keep resolving for a seeker following an old link — it leaves the
    // public feeds instead (see notFinishedWhere). Only the unverified ladder
    // unpublishes, at `urgent → expired`.
    expect(fresh._status).toBe('published')
    expect(fresh.webPath).toBeTruthy()
    expect(fresh.webUrl).toBeTruthy()
  })

  it('an inactive event expires through the ladder and never finishes', async () => {
    // Inactive events have no schedule, so contact info is required (#479).
    const event = await createEvent({
      inactive: true,
      schedule: null,
      contactPhone: '+44 20 7946 0000',
      contactName: 'Event Contact',
    })
    await makeDue(payload, event.id)
    const result = await runJob(payload)

    expect(result.finished).toBe(0)
    expect(result.advanced).toBe(1)
    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('reminded')
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Reviving a finished event. Since #603 the public feeds key off
  // `schedule.lastDate`, not `verificationStage`, so extending the schedule
  // already puts the event back on the map — the stage has to follow, or the
  // event sits publicly listed at `finished` with no `nextCheckAt`, never
  // re-verified and counted inactive by the manager sidebar.
  // ──────────────────────────────────────────────────────────────────────────
  describe('reviving a finished event', () => {
    /** A published one-off whose only occurrence is past, marked finished by the sweep. */
    async function createFinishedEvent(): Promise<Event> {
      const event = await createEvent({
        schedule: { firstDate: daysAgo(30), firstDate_tz: 'Europe/London' },
      } as Partial<Event>)
      await makeDue(payload, event.id)
      const result = await runJob(payload)
      expect(result.finished).toBe(1)
      const fresh = await getEvent(payload, event.id)
      expect(fresh.verificationStage).toBe('finished')
      expect(fresh.nextCheckAt ?? null).toBeNull()
      return fresh
    }

    it('re-verifies when a save extends the schedule past today', async () => {
      const event = await createFinishedEvent()

      const revived = await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: {
          schedule: { firstDate: inDays(14), firstDate_tz: 'Europe/London' },
        } as Partial<Event>,
      })

      expect(revived.verificationStage).toBe('verified')
      expect(revived.nextCheckAt).toBeTruthy()
      expect(new Date(revived.nextCheckAt!).getTime()).toBeGreaterThan(Date.now())
      // Back on the feeds too — lastDate is ahead of us again.
      expect(new Date(revived.schedule!.lastDate!).getTime()).toBeGreaterThan(Date.now())
    })

    it('re-verifies when a save makes the recurrence open-ended', async () => {
      const event = await createFinishedEvent()

      const revived = await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: {
          schedule: {
            firstDate: daysAgo(30),
            firstDate_tz: 'Europe/London',
            recurrenceType: 'DAILY',
            interval: 1,
          },
        } as Partial<Event>,
      })

      expect(revived.verificationStage).toBe('verified')
      // An open-ended recurrence has no lastDate, so it never finishes.
      expect(revived.schedule?.lastDate ?? null).toBeNull()
    })

    it('stays finished when a save leaves the schedule still run out', async () => {
      const event = await createFinishedEvent()

      const saved = await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: { title: 'Renamed But Still Over' } as Partial<Event>,
      })

      expect(saved.title).toBe('Renamed But Still Over')
      expect(saved.verificationStage).toBe('finished')
      expect(saved.nextCheckAt ?? null).toBeNull()
    })

    it('stays finished when the schedule moves but is still in the past', async () => {
      const event = await createFinishedEvent()

      const saved = await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: {
          schedule: { firstDate: daysAgo(3), firstDate_tz: 'Europe/London' },
        } as Partial<Event>,
      })

      expect(saved.verificationStage).toBe('finished')
    })
  })
})
