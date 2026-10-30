import type { Payload, PayloadRequest, Where } from 'payload'

import { docAccessOperation } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { verifyEventAction } from '@/collections/Events/endpoints/verifyEventAction'
import { verifyEventFromLink } from '@/collections/Events/lifecycle/verify'
import { ExpireEvents } from '@/jobs/ExpireEvents/ExpireEvents'
import { serverEnv } from '@/lib/env'
import type { NotificationLogEntry } from '@/lib/eventVerification/log'
import { buildReminderEntry, buildVerificationEntry } from '@/lib/eventVerification/log'
import type { Event, Manager } from '@/payload-types'
import { readLinkToken, signLinkToken } from '@/plugins/login'

import { createAnonRestClient, createRestClientAs, type RestClient } from '../utils/restRequest'
import { expectEventWriteRefused, storeInvalidEvent } from '../utils/storeInvalidEvent'
import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

// The verify page's Server Action reaches for the app config with
// `getPayload({ config })`. Pointed at this suite's own sanitized config, it
// runs against this file's isolated schema instead of booting the real one.
const { configRef } = vi.hoisted(() => ({ configRef: { current: undefined as unknown } }))
vi.mock('@payload-config', () => ({ default: configRef.current }))

/** Canonical base for a region no client owns — the We Meditate Atlas mount. */
const CANONICAL_FALLBACK = `${serverEnv.WEMEDITATE_WEB_URL}${serverEnv.WEMEDITATE_ATLAS_BASE_PATH}`

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

// Every event here is online and in one region, so `refuseDuplicateClass` tells
// them apart by local start time alone. Each schedule gets its own minute.
let startSlot = 0
const uniqueStart = (iso: string) =>
  new Date(new Date(iso).getTime() + (startSlot += 1) * 60_000).toISOString()

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
  log: Event['activityLog'],
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
  let verifyPageAction: (typeof import('@/app/(frontend)/events/verify/actions'))['verifyEventAction']
  let anon: RestClient
  let restEnv: Awaited<ReturnType<typeof createTestEnvironment>>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    restEnv = env
    anon = createAnonRestClient(env)
    payload = env.payload
    cleanup = env.cleanup
    adminUser = env.adminUser
    configRef.current = payload.config
    ;({ verifyEventAction: verifyPageAction } =
      await import('@/app/(frontend)/events/verify/actions'))

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
      // draft flip is observable. The hook leaves _status to the save choice.
      _status: 'published',
      ...rest,
    }
    if (!hasScheduleOverride) {
      data.schedule = {
        firstDate: uniqueStart(daysAgo(2)),
        firstDate_tz: 'Europe/London',
        recurrenceType: 'DAILY',
        interval: 1,
      }
    } else if (scheduleOverride != null) {
      // A null override omits the schedule entirely (inactive events).
      data.schedule = scheduleOverride.firstDate
        ? { ...scheduleOverride, firstDate: uniqueStart(scheduleOverride.firstDate) }
        : scheduleOverride
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
    const log = Array.isArray(event.activityLog)
      ? (event.activityLog as NotificationLogEntry[])
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
    const firstReminders = reminders(fresh.activityLog)
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
    const escalatedDestinations = reminders(fresh.activityLog)
      .filter((e) => e.stage === 'reminded')
      .map((e) => e.destination)
      .sort()
    expect(escalatedDestinations).toEqual([
      'event-manager@example.com',
      'region-manager@example.com',
    ])
    // The job records the escalation level + recipient tier (+ linking region).
    const regionEntry = reminders(fresh.activityLog).find(
      (e) => e.stage === 'reminded' && e.destination === 'region-manager@example.com',
    )
    expect(regionEntry).toMatchObject({ level: 'escalated', role: 'region', region: 'City LC' })
    const managerEntry = reminders(fresh.activityLog).find(
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
      // "Default City" has no parent → its path is `/<slug>`. The event's path
      // appends its id, and webUrl joins that to the Atlas host.
      expect(region.webPath).toBe(`/${region.slug}`)
      expect(fetched.webPath).toBe(`/${region.slug}/${event.id}`)
      // Rooted at the We Meditate surface, not the (noindex) Atlas host — no
      // client owns this region, so the canonical falls all the way back (#634).
      expect(fetched.webUrl).toBe(`${CANONICAL_FALLBACK}/${region.slug}/${event.id}`)
      // appUrl is always emitted but null — there's no Atlas app deep-link base.
      expect(fetched.appUrl).toBeNull()
    })

    it('resolves on a direct read that selects only the path fields', async () => {
      // The ensureVirtualFieldDeps beforeOperation hook re-adds `region` / `_status`,
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
      // Rooted at the We Meditate surface, not the (noindex) Atlas host — no
      // client owns this region, so the canonical falls all the way back (#634).
      expect(fetched.webUrl).toBe(`${CANONICAL_FALLBACK}/${region.slug}/${event.id}`)
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
    const escalatedDestinations = reminders(fresh.activityLog)
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

    // The event is not due, so it is not even examined.
    expect(second.remindersSent).toBe(0)
    expect(second.advanced).toBe(0)
    expect(after.verificationStage).toBe(before.verificationStage)
    expect(reminders(after.activityLog)).toHaveLength(reminders(before.activityLog).length)
  })

  describe('one-click verification from the reminder, end to end', () => {
    /**
     * The whole path a manager takes, driven by the email itself: the real job
     * sends the reminder, the link is read out of its button, the page is opened
     * the way a mail scanner would open it, and the button's own Server Action
     * verifies. Nothing below mints a link — a reminder that carried the wrong
     * one, or none, fails here.
     */
    const sent: { to: string; html: string }[] = []
    let restore: () => void

    beforeAll(() => {
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

    /** The reminder the job sends the event's manager, and the link on its button. */
    async function remind(title: string): Promise<{ event: Event; link: string }> {
      const event = await createEvent({ title })
      sent.length = 0
      await makeDue(payload, event.id)
      await runJob(payload)

      const email = sent.find((message) => message.html.includes(title))
      expect(email, `no reminder was sent for ${title}`).toBeDefined()
      // The primary button's own href — the one the manager clicks.
      const href = email!.html.match(
        /<a href="([^"]+)"[^>]*>(?:<span>.*?<\/span>)*<span[^>]*>Verify this event</,
      )?.[1]
      expect(href, 'the Verify button carries no link').toBeDefined()
      const link = new URL(href!.replaceAll('&amp;', '&')).searchParams.get('link')
      expect(link, 'the Verify button is not a verify-page link').toBeTruthy()

      return { event, link: link! }
    }

    it('verifies on the button, never on opening the link', async () => {
      const { default: VerifyEventPage } = await import('@/app/(frontend)/events/verify/page')
      const { event, link } = await remind('End-to-End Sitting')
      const before = await getEvent(payload, event.id)
      expect(before.verificationStage).toBe('reminded')

      // A mail scanner fetches the page — some fetch it more than once. The GET
      // renders the event and the form, and must change nothing.
      for (let fetch = 0; fetch < 3; fetch++) {
        const page = await VerifyEventPage({ searchParams: Promise.resolve({ link }) })
        expect(page.props).toMatchObject({ eventTitle: 'End-to-End Sitting', link })
      }
      const afterScan = await getEvent(payload, event.id)
      expect(afterScan.verificationStage).toBe('reminded')
      expect(afterScan.updatedAt).toBe(before.updatedAt)

      // The manager clicks "Verify this event": the form posts the same link.
      const form = new FormData()
      form.set('link', link)
      const outcome = await verifyPageAction(null, form)

      expect(outcome).toMatchObject({ tone: 'success', title: 'Event verified' })
      const verified = await getEvent(payload, event.id)
      expect(verified.verificationStage).toBe('verified')
      expect(verified._status).toBe('published')
      const log = verified.activityLog as NotificationLogEntry[]
      expect(log[0]).toMatchObject({ kind: 'verification', method: 'email-link' })
      expect((log[0] as Extract<NotificationLogEntry, { kind: 'verification' }>).by?.id).toBe(
        eventManager.id,
      )
    })

    it('signs the manager in on "Update the details", landing on the event', async () => {
      const { event, link } = await remind('End-to-End Edit Sitting')

      const answer = await anon(`/api/managers/redeem?token=${encodeURIComponent(link)}`, {
        method: 'POST',
      })

      expect(answer.status).toBe(302)
      expect(answer.headers.get('Location')).toMatch(
        new RegExp(`/admin/collections/events/${event.id}$`),
      )
      expect(answer.headers.get('Set-Cookie')).toBeTruthy()
      // Editing is not verifying: the event waits for the republish.
      expect((await getEvent(payload, event.id)).verificationStage).toBe('reminded')
    })
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

    /**
     * Run one reminder cycle for `event` and return the manager's email for it.
     *
     * Selected by title, not by taking the first message: every event in this
     * spec shares one manager address, and the job processes *every* due event
     * in the suite's database — so a second reminder landing in the same run
     * would otherwise be picked up here at random.
     */
    async function remindOnce(eventId: number, title: string): Promise<string> {
      sent.length = 0
      await makeDue(payload, eventId)
      await runJob(payload)
      const email = mailTo('event-manager@example.com').find((message) =>
        message.html.includes(title),
      )
      expect(email).toBeDefined()
      return email!.html
    }

    it('links the event manager to the one-click verify page for this event', async () => {
      // A page link carrying `verifies`: the verify page's button verifies
      // without signing in, and its edit button spends the same link to sign
      // the manager in on the way to the event.
      const event = await createEvent({ title: 'Linked Reminder Sitting' })
      const html = await remindOnce(event.id, 'Linked Reminder Sitting')

      const link = html.match(/events\/verify\?link=([\w.%-]+)/)?.[1]
      expect(link, 'no verify link in the reminder').toBeDefined()
      const result = await readLinkToken(decodeURIComponent(link!), payload.secret)

      expect(result.status === 'valid' && result.claims).toMatchObject({
        collection: 'managers',
        label: 'Linked Reminder Sitting',
        to: `/admin/collections/events/${event.id}`,
        userId: eventManager.id,
        verifies: event.id,
      })
    })

    it('tells a thin listing what to improve, in the registry’s own words', async () => {
      const event = await createEvent({ title: 'Sparse Listing' })
      const html = await remindOnce(event.id, 'Sparse Listing')

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

      const html = await remindOnce(event.id, 'Evening Sitting for Night-Shift Nurses')
      expect(html).toContain('Your listing is complete')
      // The ticks name what passed. The bar is dropped once there's no
      // progress left to show, so the caption goes with it.
      expect(html).toContain('Has 3+ photos')
      // "Has a good quality description" supersedes "Has a description" — the
      // report never carries a prerequisite its dependent has already passed.
      expect(html).toContain('Has a good quality description')
      expect(html).not.toContain('>Has a description<')
      expect(html).not.toMatch(/\d+ of \d+ complete/)
      expect(html).not.toContain('Add a description')
      expect(html).not.toContain('Add photos')
    })

    it('sends none for an unpublished event — it was never checked', async () => {
      // Not "no problems found": an invisible listing is not graded (#609). The
      // reminder itself still goes out, because the ladder does not care.
      const event = await createEvent({ title: 'Hidden Listing' })
      await payload.update({
        collection: 'events',
        id: event.id,
        data: { _status: 'draft' },
        context: { skipVerifyHook: true },
        overrideAccess: true,
      })

      const html = await remindOnce(event.id, 'Hidden Listing')
      // Nothing at all — not even the celebration a complete listing earns.
      // Keyed on the progress caption rather than a heading string: a
      // reworded heading would turn this into a vacuous pass.
      expect(html).not.toMatch(/\d+ of \d+ complete/)
      expect(html).not.toContain('Add a description')
    })

    it('still sends exactly one reminder per recipient when the job runs twice', async () => {
      // The trap this ticket had to avoid: dedup is keyed on stage + manager id
      // via `activityLog`. If the progress section had perturbed that key, every
      // manager would be re-sent every reminder they'd already had.
      const event = await createEvent({ title: 'Dedup Listing' })
      await remindOnce(event.id, 'Dedup Listing')
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
      expect(reminders(fresh.activityLog).filter((e) => e.stage === 'verified')).toHaveLength(1)
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
    // was already logged, but the region manager was not.
    await payload.update({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
      context: { skipVerifyHook: true },
      data: {
        verificationStage: 'escalated',
        nextCheckAt: daysAgo(1),
        // Built with the real builders, not hand-written. The entries this
        // used to spell out by hand omitted `type` and `cells`, which nothing
        // that writes this column omits — so the crash it simulates was a
        // state the app cannot actually reach, and a resume bug that depended
        // on either key would have gone unnoticed here.
        activityLog: [
          buildVerificationEntry('import', null, daysAgo(40)),
          buildReminderEntry({
            stage: 'escalated',
            level: 'escalated',
            role: 'manager',
            at: daysAgo(1),
            manager: { id: eventManager.id, name: 'Event Manager' },
            channel: 'email',
            destination: 'event-manager@example.com',
          }),
        ] as NotificationLogEntry[],
      },
    })

    const result = await runJob(payload)
    // Only the region manager (still missing) is sent — no duplicate.
    expect(result.remindersSent).toBe(1)
    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('urgent')
    const escalatedDestinations = reminders(fresh.activityLog)
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
    expect(reminders(fresh.activityLog)).toHaveLength(0)
    const log = fresh.activityLog as NotificationLogEntry[]
    expect(log[0]).toMatchObject({ kind: 'verification', method: 're-save' })
  })

  describe('systemMeta write protection', () => {
    // `systemMeta` is hidden from non-admin managers in the admin UI. That is
    // only safe because visibility and writability are decided separately: the
    // field's `access.update` refuses every non-overrideAccess write, and
    // Payload responds by *deleting the key from the incoming patch* rather
    // than nulling the column. Without that, a manager saving a form that
    // never rendered the field could silently wipe it.
    it('survives a save that omits it, and one that tries to clear it', async () => {
      const event = await createEvent()
      const feedback = { confirmations: 3, denials: 1, updatedAt: new Date().toISOString() }
      await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        context: { skipVerifyHook: true },
        data: { systemMeta: { communityFeedback: feedback } } as Partial<Event>,
      })

      // A normal manager save (access enforced, field absent from the patch).
      await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: false,
        user: { ...eventManager, collection: 'managers' } as never,
        data: { title: 'Edited Without System Meta' } as Partial<Event>,
      })
      let fresh = await getEvent(payload, event.id)
      expect(fresh.title).toBe('Edited Without System Meta')
      expect(fresh.systemMeta).toEqual({ communityFeedback: feedback })

      // And an explicit attempt to null it through the API is refused too.
      // `as never` because the field's JSON Schema type forbids null — which is
      // exactly the forged payload this is proving the server rejects.
      await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: false,
        user: { ...eventManager, collection: 'managers' } as never,
        data: { systemMeta: null } as never,
      })
      fresh = await getEvent(payload, event.id)
      expect(fresh.systemMeta).toEqual({ communityFeedback: feedback })
    })

    it('still lets the system write it (overrideAccess skips field access)', async () => {
      const event = await createEvent()
      await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        context: { skipVerifyHook: true },
        data: { systemMeta: { communityFeedback: { confirmations: 9, denials: 0 } } } as never,
      })
      const fresh = await getEvent(payload, event.id)
      expect(fresh.systemMeta).toMatchObject({ communityFeedback: { confirmations: 9 } })
    })
  })

  describe('pre-adoption stages (unverified / denied)', () => {
    it('a grooming save leaves a managerless unverified event untouched', async () => {
      const event = await createEvent({
        manager: null,
        verificationStage: 'unverified',
      })
      expect(event.verificationStage).toBe('unverified')
      expect(event.nextCheckAt ?? null).toBeNull()

      // An admin fixes a typo without assigning a manager: editing text is not
      // vouching the event exists, so nothing about verification may change.
      await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: { title: 'Groomed Title' },
      })

      const after = await getEvent(payload, event.id)
      expect(after.title).toBe('Groomed Title')
      expect(after.verificationStage).toBe('unverified')
      expect(after.nextCheckAt ?? null).toBeNull()
    })

    it('assigning a manager and saving adopts the event (→ verified, cycle opens)', async () => {
      const event = await createEvent({
        manager: null,
        verificationStage: 'unverified',
      })

      await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: { manager: eventManager.id },
      })

      const after = await getEvent(payload, event.id)
      expect(after.verificationStage).toBe('verified')
      expect(after.nextCheckAt).toBeTruthy()
      const log = after.activityLog as NotificationLogEntry[]
      expect(log[0]).toMatchObject({ kind: 'verification', method: 're-save' })
    })

    it('adoption also rescues a denied event (stage flips; publish stays a manual step)', async () => {
      const event = await createEvent({
        manager: null,
        verificationStage: 'denied',
        _status: 'draft',
      })

      await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: { manager: eventManager.id },
      })

      const after = await getEvent(payload, event.id)
      expect(after.verificationStage).toBe('verified')
      // verifyOnSave never forces _status — republish is the manager's call.
      expect(after._status).toBe('draft')
    })

    it('refuses to hold a managed stage without a manager', async () => {
      const event = await createEvent({
        manager: null,
        verificationStage: 'unverified',
      })

      // Forcing the stage to `verified` while the manager is still null must
      // fail validation: verified always implies managed. (Payload surfaces
      // the per-field message in `error.data`. The thrown message names the
      // field.)
      await expect(
        payload.update({
          collection: 'events',
          id: event.id,
          overrideAccess: true,
          context: { skipVerifyHook: true },
          data: { verificationStage: 'verified' },
        }),
      ).rejects.toThrow(/Verification > Manager/i)
    })
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
    const log = fresh.activityLog as NotificationLogEntry[]
    expect(log[0]).toMatchObject({ kind: 'verification', method: 'verify-action' })
  })

  /** A reminder's verify link, as ExpireEvents mints it for the event's manager. */
  const verifyLink = (eventId: number, overrides: Record<string, unknown> = {}) =>
    signLinkToken(
      {
        collection: 'managers',
        issuedAt: Date.now(),
        userId: eventManager.id,
        label: 'An event',
        to: `/admin/collections/events/${eventId}`,
        verifies: eventId,
        ...overrides,
      },
      payload.secret,
    )

  it('verifyEventFromLink verifies a logged-out event link (method email-link)', async () => {
    const event = await createEvent()
    await makeDue(payload, event.id)
    await runJob(payload) // → reminded

    const verified = await verifyEventFromLink({ payload, link: await verifyLink(event.id) })

    expect(verified?.verificationStage).toBe('verified')
    expect(verified?._status).toBe('published')
    const log = (verified as Event).activityLog as NotificationLogEntry[]
    expect(log[0]).toMatchObject({ kind: 'verification', method: 'email-link' })
    expect((log[0] as Extract<NotificationLogEntry, { kind: 'verification' }>).by?.id).toBe(
      eventManager.id,
    )
  })

  it('verifyEventFromLink verifies nothing for a link that names no event, or a bad one', async () => {
    const event = await createEvent()
    const before = await getEvent(payload, event.id)

    // A region manager's link signs them in, but carries no `verifies`.
    const noEvent = await verifyLink(event.id, { verifies: undefined })
    expect(await verifyEventFromLink({ payload, link: noEvent })).toBeNull()
    expect(await verifyEventFromLink({ payload, link: 'not-a-valid-link' })).toBeNull()

    expect((await getEvent(payload, event.id)).updatedAt).toBe(before.updatedAt)
  })

  it('verifyEventFromLink refuses a manager deactivated since the reminder', async () => {
    const event = await createEvent()
    const former = await testData.createManager(payload, {
      name: 'Former Manager',
      email: `former-${event.id}@example.com`,
      type: 'inactive',
    })

    const link = await verifyLink(event.id, { userId: former.id })
    expect(await verifyEventFromLink({ payload, link })).toBeNull()
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
    // Re-armed at the retention deadline rather than cleared — that watermark
    // is how the job finds it again to trash it 6 months on.
    expect(new Date(fresh.nextCheckAt as string).getTime()).toBeGreaterThan(Date.now())
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
      // The retention watermark, not null — see the `finished` entry in STAGES.
      expect(fresh.nextCheckAt).toBeTruthy()
      return fresh
    }

    it('re-verifies when a save extends the schedule past today', async () => {
      const event = await createFinishedEvent()

      const revived = await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: {
          schedule: { firstDate: uniqueStart(inDays(14)), firstDate_tz: 'Europe/London' },
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
            firstDate: uniqueStart(daysAgo(30)),
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
      expect(saved.nextCheckAt).toBeTruthy()
    })

    it('stays finished when the schedule moves but is still in the past', async () => {
      const event = await createFinishedEvent()

      const saved = await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: {
          schedule: { firstDate: uniqueStart(daysAgo(3)), firstDate_tz: 'Europe/London' },
        } as Partial<Event>,
      })

      expect(saved.verificationStage).toBe('finished')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Invalid stored data (#842) — verify must keep refusing, and each surface
  // must say what is actually wrong. The bookkeeping writes bypass validation
  // instead; those live in their own specs.
  // ──────────────────────────────────────────────────────────────────────────
  describe('verifying an event whose stored data fails a field validator', () => {
    /** Inactive, published, and stored with neither contact — the #835 shape. */
    async function createUnverifiableEvent(): Promise<Event> {
      const event = await createEvent({
        inactive: true,
        schedule: null,
        contactPhone: '+44 20 7946 0000',
      })
      await storeInvalidEvent(payload, event.id, { contactPhone: null, contactEmail: null })
      return event
    }

    function endpointReq(event: Event, user: Manager) {
      return {
        payload,
        user: { ...user, collection: 'managers' },
        routeParams: { id: String(event.id) },
        query: {},
        headers: new Headers(),
      } as unknown as Parameters<typeof verifyEventAction.handler>[0]
    }

    it('the endpoint answers 422 with the field messages, leaving the event alone', async () => {
      const event = await createUnverifiableEvent()
      await expectEventWriteRefused(
        payload,
        event.id,
        { verificationStage: 'verified' },
        /Contact Phone Number/,
      )
      const before = await getEvent(payload, event.id)

      const res = await verifyEventAction.handler(endpointReq(event, adminUser))
      expect(res.status).toBe(422)

      const body = (await res.json()) as { errors: { path: string; message: string }[] }
      expect(body.errors.some((e) => e.path === 'contactPhone')).toBe(true)
      expect(body.errors.every((e) => typeof e.message === 'string' && e.message.length > 0)).toBe(
        true,
      )

      const after = await getEvent(payload, event.id)
      expect(after.verificationStage).toBe(before.verificationStage)
      expect(after._status).toBe(before._status)
    })

    it('the endpoint still answers 403 for a manager without update access', async () => {
      const event = await createUnverifiableEvent()
      const stage = (await getEvent(payload, event.id)).verificationStage
      // Listed on no region and on no event, so document-level manager access
      // denies the update — a different failure from the one above.
      const outsider = await testData.createManager(payload, {
        name: 'Outside Manager',
        email: `outsider-${event.id}@example.com`,
      })

      const res = await verifyEventAction.handler(endpointReq(event, outsider))
      expect(res.status).toBe(403)

      expect((await getEvent(payload, event.id)).verificationStage).toBe(stage)
    })

    it('the verify page names the failing fields, and edits through a sign-in', async () => {
      const event = await createUnverifiableEvent()
      const form = new FormData()
      form.set('link', await verifyLink(event.id))

      const outcome = await verifyPageAction(null, form)

      expect(outcome.tone).toBe('warning')
      expect(outcome.message).toMatch(/Contact Phone Number/)
      // The edit button spends the page link — a POST that signs them in on the
      // way to the event, where the form shows the same errors.
      const edit = outcome.actions.find((action) => action.variant === 'primary')
      expect(edit).toMatchObject({ method: 'post' })
      expect(edit?.href).toMatch(/\/api\/managers\/redeem\?token=/)
      expect(outcome.actions.some((action) => action.href.startsWith('mailto:'))).toBe(false)
    })

    it('the verify page still offers the support mailto for a non-validation failure', async () => {
      const event = await createUnverifiableEvent()
      const form = new FormData()
      form.set('link', await verifyLink(event.id))
      // Raised from inside the write the action performs, so it takes the same
      // catch as the case above.
      const spy = vi
        .spyOn(payload, 'update')
        .mockRejectedValueOnce(new Error('the database went away'))

      const outcome = await verifyPageAction(null, form)
      spy.mockRestore()

      expect(outcome.tone).toBe('error')
      expect(outcome.actions.some((action) => action.href.startsWith('mailto:'))).toBe(true)
    })
  })

  // #1047. A reminder records the address it went to, and `atlas-manager`
  // reads `events` project-wide — so the log is narrowed per reader, address
  // only. Every read below is `overrideAccess: false` AS the reader: an
  // override read skips the narrowing by design, so it would prove nothing.
  describe('who reads a reminder address', () => {
    const EVENT_MANAGER = 'log-event-manager@example.com'
    const COUNTRY_MANAGER = 'log-country-manager@example.com'
    const FORMER_MANAGER = 'log-former-manager@example.com'
    const OUTSIDER = 'log-outsider@example.com'

    let event: Event
    let logEventManager: Manager
    let countryManager: Manager
    let formerManager: Manager
    let outsider: Manager
    let elsewhere: { id: number }

    const asManager = (manager: Manager): PayloadRequest =>
      ({
        payload,
        headers: new Headers(),
        context: {},
        locale: 'en',
        user: { ...manager, collection: 'managers' },
      }) as unknown as PayloadRequest

    const readLog = async (req: PayloadRequest, select?: Record<string, true>) => {
      const doc = await payload.findByID({
        collection: 'events',
        id: event.id,
        depth: 0,
        overrideAccess: false,
        ...(select && { select }),
        req,
      })
      return reminders(doc.activityLog)
    }

    /** destination → whether it, and its Delivery cell, came back. */
    const shown = (log: ReturnType<typeof reminders>) =>
      Object.fromEntries(
        log.map((entry) => [
          entry.manager.name,
          entry.destination !== undefined && entry.cells.delivery !== undefined,
        ]),
      )

    beforeAll(async () => {
      logEventManager = await testData.createManager(payload, {
        name: 'Log Event Manager',
        email: EVENT_MANAGER,
        roles: ['atlas-manager'],
      })
      countryManager = await testData.createManager(payload, {
        name: 'Log Country Manager',
        email: COUNTRY_MANAGER,
        roles: ['atlas-manager'],
      })
      // Was escalated to once, and manages nothing this event sits in now.
      formerManager = await testData.createManager(payload, {
        name: 'Log Former Manager',
        email: FORMER_MANAGER,
        roles: ['atlas-manager'],
      })
      outsider = await testData.createManager(payload, {
        name: 'Log Outsider',
        email: OUTSIDER,
        roles: ['atlas-manager'],
      })

      const country = await payload.create({
        collection: 'regions',
        overrideAccess: true,
        data: createData<'regions'>({
          name: 'Log Country',
          level: 'country',
          mapboxId: 'log-country',
          managers: [countryManager.id],
        }),
      })
      const city = await payload.create({
        collection: 'regions',
        overrideAccess: true,
        data: createData<'regions'>({
          name: 'Log City',
          level: 'city',
          mapboxId: 'log-city',
          parent: country.id,
        }),
      })
      // The outsider runs a region of their own, so "outside" means another
      // subtree rather than no subtree at all.
      elsewhere = await payload.create({
        collection: 'regions',
        overrideAccess: true,
        data: createData<'regions'>({
          name: 'Elsewhere',
          level: 'country',
          mapboxId: 'log-elsewhere',
          managers: [outsider.id],
        }),
      })

      event = await createEvent({ region: city.id, manager: logEventManager.id })
      const at = new Date().toISOString()
      const entry = (manager: Manager, destination: string, role: 'manager' | 'region') =>
        buildReminderEntry({
          stage: 'reminded',
          level: 'escalated',
          role,
          ...(role === 'region' && { region: 'Log Country' }),
          manager: { id: manager.id, name: manager.name },
          channel: 'email',
          destination,
          at,
        })
      // `skipVerifyHook`, or the managed save resets the log to one entry.
      await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        context: { skipVerifyHook: true },
        data: {
          activityLog: [
            buildVerificationEntry(
              're-save',
              { id: logEventManager.id, name: 'Log Event Manager' },
              at,
            ),
            entry(logEventManager, EVENT_MANAGER, 'manager'),
            entry(countryManager, COUNTRY_MANAGER, 'region'),
            entry(formerManager, FORMER_MANAGER, 'region'),
          ],
        } as never,
      })
    })

    it('stores every address, so a hidden one below is the narrowing', async () => {
      expect(shown(reminders((await getEvent(payload, event.id)).activityLog))).toEqual({
        'Log Event Manager': true,
        'Log Country Manager': true,
        'Log Former Manager': true,
      })
    })

    it('hides every address from an atlas-manager outside the region, and nothing else', async () => {
      const log = await readLog(asManager(outsider))
      expect(shown(log)).toEqual({
        'Log Event Manager': false,
        'Log Country Manager': false,
        'Log Former Manager': false,
      })
      // That a reminder went out, to whom and when, still reads.
      expect(log[1]).toMatchObject({
        kind: 'reminder',
        channel: 'email',
        manager: { id: countryManager.id, name: 'Log Country Manager' },
        cells: { activity: 'Escalation', who: { text: 'Log Country Manager' } },
      })
      expect(JSON.stringify(log)).not.toMatch(/@example\.com/)

      // A verification's Delivery cell is the method, not an address, so it
      // stays — under the very key a reminder's address is removed from.
      const whole = await payload.findByID({
        collection: 'events',
        id: event.id,
        depth: 0,
        overrideAccess: false,
        req: asManager(outsider),
      })
      expect((whole.activityLog as NotificationLogEntry[])[0]).toMatchObject({
        kind: 'verification',
        cells: { delivery: 'Saved' },
      })
    })

    it('hides them on a read that selects the log alone', async () => {
      // No `region` or `manager` on the row, so the decision loads them.
      expect(shown(await readLog(asManager(outsider), { activityLog: true }))).toEqual({
        'Log Event Manager': false,
        'Log Country Manager': false,
        'Log Former Manager': false,
      })
    })

    it('hides them over REST, select and all', async () => {
      const rest = await createRestClientAs(restEnv, outsider)
      const { status, body } = await rest(
        `/api/events/${event.id}?depth=0&select[activityLog]=true`,
      )
      expect(status).toBe(200)
      expect(reminders(body.activityLog as Event['activityLog'])).toHaveLength(3)
      expect(JSON.stringify(body)).not.toMatch(/@example\.com/)
    })

    it('shows the region manager above the event every address', async () => {
      const all = {
        'Log Event Manager': true,
        'Log Country Manager': true,
        'Log Former Manager': true,
      }
      expect(shown(await readLog(asManager(countryManager)))).toEqual(all)
      expect(shown(await readLog(asManager(countryManager), { activityLog: true }))).toEqual(all)
    })

    it("shows the event's own manager the region managers it escalated to", async () => {
      expect(shown(await readLog(asManager(logEventManager)))).toEqual({
        'Log Event Manager': true,
        'Log Country Manager': true,
        'Log Former Manager': true,
      })
    })

    it('shows a manager outside the region their own address, and only theirs', async () => {
      expect(shown(await readLog(asManager(formerManager)))).toEqual({
        'Log Event Manager': false,
        'Log Country Manager': false,
        'Log Former Manager': true,
      })
    })

    it('shows an admin every address', async () => {
      expect(shown(await readLog(asManager(adminUser)))).toEqual({
        'Log Event Manager': true,
        'Log Country Manager': true,
        'Log Former Manager': true,
      })
    })

    it('gives an API client no log at all', async () => {
      const client = await testData.createClient(payload, logEventManager.id, {
        name: 'Log Widget Key',
        roles: ['sahaj-atlas-client'],
      })
      const req = {
        ...createClientAuthenticatedRequest(client.id, 'unused', ['sahaj-atlas-client']),
        payload,
        context: {},
      } as unknown as PayloadRequest
      const { docs } = await payload.find({
        collection: 'events',
        where: { id: { equals: event.id } },
        select: { title: true, activityLog: true },
        depth: 0,
        overrideAccess: false,
        req,
      })
      expect(docs).toHaveLength(1)
      expect(docs[0]!.activityLog).toBeUndefined()
    })

    it('refuses a filter on the log to every non-admin, so no guess can be tested', async () => {
      const probe = (req: PayloadRequest, where: Where) =>
        payload
          .find({
            collection: 'events',
            where: { and: [{ id: { equals: event.id } }, where] },
            select: { title: true },
            depth: 0,
            overrideAccess: false,
            req,
          })
          .then(
            ({ docs }) => docs.length,
            (error: { status?: number }) => `refused ${error.status}`,
          )
      const guesses: Where[] = [
        { 'activityLog.destination': { equals: COUNTRY_MANAGER } },
        { 'activityLog.destination': { like: 'log-country' } },
        { 'activityLog.cells.delivery.text': { equals: COUNTRY_MANAGER } },
        { or: [{ activityLog: { exists: true } }] },
        // Payload reads `AND`/`OR` case-insensitively, so a guard spelled in
        // lower case alone would wave these through.
        { OR: [{ 'activityLog.destination': { like: 'log-country' } }] } as Where,
      ]

      // The control: the filter really does match, and really can miss. Without
      // it a refusal below could be a filter Payload never applied at all.
      expect(await probe(asManager(adminUser), guesses[0]!)).toBe(1)
      expect(
        await probe(asManager(adminUser), {
          'activityLog.destination': { equals: 'nobody@example.com' },
        }),
      ).toBe(0)

      // A region manager is refused too: a query spans every event, not the
      // one whose addresses they may read.
      for (const reader of [outsider, countryManager]) {
        for (const where of guesses) {
          expect(await probe(asManager(reader), where)).toBe('refused 400')
        }
      }
      const rest = await createRestClientAs(restEnv, outsider)
      for (const path of [
        `/api/events?where[activityLog.destination][like]=log-country`,
        `/api/events?sort=-activityLog`,
        `/api/events/count?where[AND][0][activityLog.destination][like]=log-country`,
        // Through a join, and across a relationship from another collection —
        // neither runs the events collection's own hooks.
        `/api/regions?where[events.activityLog.destination][like]=log-country`,
        `/api/regions?joins[events][where][activityLog.destination][like]=log-country`,
        `/api/managers?joins[managedEvents][where][activityLog.destination][like]=log-country`,
      ]) {
        expect((await rest(path)).status, path).toBe(400)
      }
      await expect(
        payload.findDistinct({
          collection: 'events',
          field: 'activityLog',
          overrideAccess: false,
          req: asManager(outsider),
        }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('still renders the log on the edit view for a non-admin', async () => {
      // The lock refuses a read with no row in hand, and the admin decides
      // what to render from field permissions — computed WITH the row for a
      // document view. Refused there, the Verification tab would show nothing.
      const { fields } = await docAccessOperation({
        id: event.id,
        collection: payload.collections.events,
        req: asManager(outsider),
      })
      const log = fields === true ? true : fields.activityLog
      expect(log === true || log?.read === true).toBe(true)
    })

    it('starts a duplicate with no log, so a copy re-homed elsewhere carries no address', async () => {
      // Unmanaged, so the verify-on-save hook leaves the copy's log alone —
      // it is this field's own duplicate hook that empties it.
      const source = await createEvent({
        manager: null,
        verificationStage: 'unverified',
        _status: 'draft',
      })
      await payload.update({
        collection: 'events',
        id: source.id,
        overrideAccess: true,
        context: { skipVerifyHook: true },
        data: {
          activityLog: [
            buildReminderEntry({
              stage: 'reminded',
              level: 'escalated',
              role: 'region',
              manager: { id: countryManager.id, name: countryManager.name },
              channel: 'email',
              destination: COUNTRY_MANAGER,
              at: new Date().toISOString(),
            }),
          ],
        } as never,
      })
      expect(JSON.stringify((await getEvent(payload, source.id)).activityLog)).toContain(
        COUNTRY_MANAGER,
      )

      // Re-homed into the outsider's own region, where they would read it whole.
      const copy = await payload.duplicate({
        collection: 'events',
        id: source.id,
        data: { region: elsewhere.id },
        overrideAccess: true,
        draft: true,
      })
      expect(JSON.stringify((await getEvent(payload, copy.id)).activityLog ?? [])).not.toContain(
        COUNTRY_MANAGER,
      )
    })
  })
})
