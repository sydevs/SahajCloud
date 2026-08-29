/**
 * Operator script: send the registrant confirmation email in each of its
 * meaningful states to the Mailpit capture inbox for visual review. Prints a
 * direct preview link per scenario.
 *
 * Usage:
 *   pnpm tsx scripts/preview-registration-emails.ts             # in-memory fixtures
 *   FROM_DB=1 pnpm tsx scripts/preview-registration-emails.ts   # real services + events
 *
 * `FROM_DB=1` picks a representative spread of real published services and
 * events out of the local database and renders the email for each — useful for
 * seeing the template against production-shaped content (long titles, other
 * languages, missing optional fields). It is **read-only**: the selection is
 * query-driven, and nothing is created or modified.
 *
 * Without the flag, no database is touched. The script
 * drives the **real** `sendRegistrationConfirmation()` composition path through
 * a stub `payload` (its only Payload touchpoints are `findGlobal`, `sendEmail`,
 * and `logger`), so what you see is what the endpoint sends: same subject,
 * `From`, `Reply-To`, HTML, plain-text part, and `.ics` attachment. Nothing is
 * reimplemented here, so this preview can't drift from production behaviour.
 *
 * The `.ics` attachment rides along on each message — download it from Mailpit
 * and open it in Google Calendar / Apple Calendar to check the recurrence,
 * timezone, and any excluded dates.
 *
 * Header logos are absolute URLs. `SAHAJCLOUD_URL` defaults to production here
 * so the icon actually renders in the preview; override it to point elsewhere.
 */

import type { EmailClient } from '@/lib/notifications/sendRegistrationConfirmation'
import type { LocaleCode } from '@/lib/locales'
import type { Event } from '@/payload-types'

import { Temporal } from '@js-temporal/polyfill'
import dotenv from 'dotenv'

import { isValidLocale } from '@/lib/locales'
import { createCaptureTransport } from './mailpit-transport'

// Shell env wins, then .env.local, then .env (see seeds/env.ts).
dotenv.config({ path: ['.env.local', '.env'] })

// Absolute icon URLs must resolve for the reviewer's mail client, so default to
// production rather than a localhost the Mailpit viewer can't reach.
process.env.SAHAJCLOUD_URL ||= 'https://cloud.sydevelopers.com'

/**
 * The next occurrence of `weekday` at `hour`:00 **local time** in `tz`, at
 * least three days out, as a UTC ISO string.
 *
 * Anchoring to a real weekday + wall-clock hour matters twice over: a
 * `now + N days` fixture inherits the current time-of-day (so the preview reads
 * "5:04 PM" and tells you nothing about formatting), and an exclusion date that
 * doesn't land on an occurrence produces no EXDATE at all — silently turning
 * the "course with a cancelled session" scenario into a plain one.
 *
 * `dayOfWeek` is ISO-numbered: 1 = Monday … 7 = Sunday.
 */
function nextLocalOccurrence(weekday: number, hour: number, tz: string): string {
  let zdt = Temporal.Now.zonedDateTimeISO(tz)
    .add({ days: 3 })
    .with({ hour, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
  while (zdt.dayOfWeek !== weekday) zdt = zdt.add({ days: 1 })
  return new Date(Number(zdt.epochMilliseconds)).toISOString()
}

/** Calendar day (YYYY-MM-DD) `weeks` after an ISO instant, in `tz`. */
function localDatePlusWeeks(isoInstant: string, weeks: number, tz: string): string {
  return Temporal.Instant.from(isoInstant)
    .toZonedDateTimeISO(tz)
    .add({ weeks })
    .toPlainDate()
    .toString()
}

/** Minimal Lexical editor state wrapping a single paragraph. */
function lexical(text: string) {
  return {
    root: {
      type: 'root',
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          children: [{ type: 'text', version: 1, format: 0, text }],
        },
      ],
    },
  }
}

const DESCRIPTION = lexical(
  'A gentle weekly Sahaja Yoga meditation open to all. Experience cool vibrations, guided ' +
    'self-realisation, and a calm start to your week. No experience needed — just come as you are.',
)

const LONDON = 'Europe/London'
const TUESDAY = 2
const SATURDAY = 6

/** A weekly 19:00 evening class in London, bounded to an 8-session course. */
const COURSE_START = nextLocalOccurrence(TUESDAY, 19, LONDON)

const WEEKLY_COURSE = {
  firstDate: COURSE_START,
  firstDate_tz: LONDON,
  recurrenceType: 'WEEKLY',
  interval: 1,
  weekdays: ['TU'],
  endTime: '20:30',
  endingType: 'count',
  count: 8,
  // Three weeks in — a real occurrence of the rule, so it actually yields an
  // EXDATE rather than silently excluding nothing.
  exclusions: [
    {
      startDate: localDatePlusWeeks(COURSE_START, 3, LONDON),
      endDate: localDatePlusWeeks(COURSE_START, 3, LONDON),
      reason: 'Bank holiday',
    },
  ],
}

const ADDRESS = {
  street: '12 Example Street',
  room: '2nd Floor, Community Hall',
  postCode: 'SW1A 1AA',
  country: 'GB',
  region: 'Greater London',
  city: 'London',
  latitude: 51.5074,
  longitude: -0.1278,
}

const onlineEvent = {
  id: 1042,
  title: 'Tuesday Evening Meditation',
  eventType: 'online',
  onlineUrl: 'https://meet.example.com/tuesday-meditation-abc-def',
  description: DESCRIPTION,
  contactName: 'Priya Deshmukh',
  contactPhone: '+44 20 7946 0000',
  schedule: WEEKLY_COURSE,
} as unknown as Event

const offlineEvent = {
  id: 1043,
  title: 'Saturday Morning Meditation',
  eventType: 'offline',
  address: ADDRESS,
  description: DESCRIPTION,
  contactName: 'Priya Deshmukh',
  contactPhone: '+44 20 7946 0000',
  // Open-ended (no endingType/count) 10:00 Saturday class — no session count.
  schedule: {
    ...WEEKLY_COURSE,
    firstDate: nextLocalOccurrence(SATURDAY, 10, LONDON),
    weekdays: ['SA'],
    endTime: '11:30',
    endingType: undefined,
    count: undefined,
    exclusions: undefined,
  },
} as unknown as Event

/** A single dated session — no recurrence phrase, no session count. */
const oneOffEvent = {
  id: 1044,
  title: 'Introduction to Meditation — Open Day',
  eventType: 'offline',
  address: ADDRESS,
  description: DESCRIPTION,
  contactName: 'Priya Deshmukh',
  contactPhone: '+44 20 7946 0000',
  schedule: {
    firstDate: nextLocalOccurrence(SATURDAY, 10, LONDON),
    firstDate_tz: LONDON,
    endTime: '12:00',
  },
} as unknown as Event

/** Nothing optional set — every conditional section should collapse. */
const minimalEvent = {
  id: 1045,
  title: 'Weekly Meditation',
  eventType: 'online',
  onlineUrl: 'https://meet.example.com/minimal',
  // Also exercises a non-DST zone rendering as GMT+5:30 rather than an abbreviation.
  schedule: {
    firstDate: nextLocalOccurrence(TUESDAY, 19, 'Asia/Kolkata'),
    firstDate_tz: 'Asia/Kolkata',
    recurrenceType: 'WEEKLY',
  },
} as unknown as Event

/** A fully-configured client service. */
const brandedClient: EmailClient = {
  name: 'Sahaja Yoga London',
  color1: '#7B4EA8',
  color2: '#B08BD4',
  logo: null, // no Cloudflare image locally — falls back to the Atlas icon
  websiteUrl: 'https://www.sahajayogalondon.example',
  supportEmail: 'hello@sahajayogalondon.example',
}

/**
 * The realistic half-configured service: `Clients.name` is required by the
 * schema, so a client always has one — but everything the email adds is
 * optional and falls back independently.
 */
const partialClient: EmailClient = {
  name: 'Meditation Berlin',
  color1: '#0F766E',
  color2: null,
  logo: null,
  websiteUrl: null,
  supportEmail: null,
}

/**
 * A partially-translated German `emails` group. `confirmation_subject`,
 * `contact_label`, and others are deliberately omitted so the per-key English
 * fallback is visible in the rendered mail.
 */
const GERMAN_EMAILS = {
  confirmation_heading: 'Du bist angemeldet',
  confirmation_intro: 'Hallo %{name}, dein Platz ist bestätigt. Hier sind die Details.',
  when_label: 'Wann',
  where_label: 'Wo',
  online_cta: 'Online teilnehmen',
  online_link_hint: 'Falls der Button nicht funktioniert, kopiere diesen Link:',
  about_label: 'Was dich erwartet',
  sessions_count_one: '%{count} Termin',
  sessions_count_other: '%{count} Termine',
}

interface Scenario {
  label: string
  note: string
  event: Event
  client: EmailClient | null
  locale?: LocaleCode
  translations?: Record<string, unknown>
  registrantName?: string
}

/**
 * Pick a representative spread of real services + events from the local
 * database (`FROM_DB=1`).
 *
 * Selection is query-driven rather than hardcoded ids, so it works against any
 * database. Read-only: nothing is created or modified.
 *
 * The client↔event pairing is deliberately arbitrary — a registration's client
 * is whoever holds the API key that called the endpoint, not a property of the
 * event — so events are simply round-robined across services.
 */
async function selectFromDatabase(): Promise<Scenario[]> {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })

  const published = { _status: { equals: 'published' } }

  const { docs: clients } = await payload.find({
    collection: 'clients',
    where: { and: [published, { roles: { contains: 'sahaj-atlas-client' } }] },
    depth: 1, // populate `logo` so a configured one resolves to an image URL
    limit: 30,
    overrideAccess: true,
  })
  if (clients.length === 0) throw new Error('No published sahaj-atlas-client services found.')

  // Best-branded service first, so the sample shows the most configured state
  // the database actually contains.
  const score = (c: (typeof clients)[number]) =>
    [c.logo, c.websiteUrl, c.supportEmail, c.color1 && c.color1 !== '#000000'].filter(Boolean)
      .length
  const ranked = [...clients].sort((a, b) => score(b) - score(a))

  // Fetch one pool and select from it in memory. Filtering in JS rather than
  // per-criterion `where` clauses keeps this portable: `schedule.firstDate_tz`
  // is a Postgres enum column, so a `like` on it has no matching operator and
  // errors out at the driver.
  const { docs: pool } = await payload.find({
    collection: 'events',
    where: published,
    depth: 0,
    limit: 400,
    overrideAccess: true,
  })
  const events = pool as Event[]

  const tzOf = (e: Event) => (e.schedule as { firstDate_tz?: string } | undefined)?.firstDate_tz
  const recOf = (e: Event) =>
    (e.schedule as { recurrenceType?: string } | undefined)?.recurrenceType

  /** First event matching `match`, skipping ones already chosen. */
  const chosen = new Set<number>()
  const pick = (match: (e: Event) => boolean): Event | null => {
    const found = events.find((e) => !chosen.has(e.id) && match(e))
    if (found) chosen.add(found.id)
    return found ?? null
  }

  const candidates: { note: string; event: Event | null }[] = [
    {
      note: 'online event — join URL as CTA and as plain text',
      event: pick((e) => e.eventType === 'online' && !!e.onlineUrl && !!e.contactName),
    },
    {
      note: 'in-person with description + host — Get Directions button',
      event: pick((e) => e.eventType === 'offline' && !!e.description && !!e.contactName),
    },
    {
      note: 'in-person with no description and no host — those sections collapse',
      event: pick((e) => e.eventType === 'offline' && !e.description && !e.contactName),
    },
    {
      note: 'non-European timezone — checks the tz label and local times',
      event: pick((e) => !!tzOf(e) && !tzOf(e)!.startsWith('Europe/')),
    },
    {
      note: 'monthly recurrence — recurrence spelled out in words',
      event: pick((e) => recOf(e) === 'MONTHLY'),
    },
    {
      note: 'daily recurrence',
      event: pick((e) => recOf(e) === 'DAILY'),
    },
  ]

  return candidates
    .filter((c): c is { note: string; event: Event } => c.event !== null)
    .map(({ note, event }, i) => {
      const client = ranked[i % ranked.length]
      const tz = (event.schedule as { firstDate_tz?: string } | undefined)?.firstDate_tz
      return {
        label: `#${event.id} ${String(event.title).slice(0, 28)} · ${client.name}`,
        note: `${note} (${tz ?? 'no tz'})`,
        event,
        client,
        // A service's configured language is the realistic locale for someone
        // registering through it.
        locale: (isValidLocale(String(client.locale)) ? client.locale : 'en') as LocaleCode,
      }
    })
}

const SCENARIOS: Scenario[] = [
  {
    label: 'online · branded',
    note: 'join URL as CTA *and* plain text; 8-session course; ICS with an EXDATE',
    event: onlineEvent,
    client: brandedClient,
  },
  {
    label: 'offline · branded',
    note: 'full address + a Get Directions button, no join-link section',
    event: offlineEvent,
    client: brandedClient,
  },
  {
    label: 'online · german',
    note: 'partly-translated locale — untranslated keys fall back to English',
    event: onlineEvent,
    client: brandedClient,
    locale: 'de',
    translations: GERMAN_EMAILS,
    registrantName: 'Lukas Bauer',
  },
  {
    label: 'online · unbranded',
    note: 'client with no name/logo/website — falls back to the Atlas project brand',
    event: onlineEvent,
    client: null,
  },
  {
    label: 'online · partial brand',
    note: 'colour set but no logo/website/supportEmail — icon, footer link and Reply-To fall back',
    event: onlineEvent,
    client: partialClient,
  },
  {
    label: 'offline · one-off',
    note: 'single dated session — full date instead of a recurrence phrase, no session count',
    event: oneOffEvent,
    client: brandedClient,
  },
  {
    label: 'online · minimal',
    note: 'no description, host, end time, or website — every optional section collapses',
    event: minimalEvent,
    client: partialClient,
  },
]

async function main() {
  const nodemailer = (await import('nodemailer')).default
  const { sendRegistrationConfirmation } =
    await import('@/lib/notifications/sendRegistrationConfirmation')

  const fromDb = Boolean(process.env.FROM_DB)
  const scenarios = fromDb ? await selectFromDatabase() : SCENARIOS

  // In database mode, read the *real* translations global so the copy is
  // whatever this environment actually has configured. Everything else about
  // the send is identical between the two modes.
  let realFindGlobal: ((args: unknown) => Promise<unknown>) | null = null
  if (fromDb) {
    const { getPayload } = await import('payload')
    const { default: config } = await import('../src/payload.config')
    const real = await getPayload({ config })
    realFindGlobal = (args) => real.findGlobal(args as never)
  }

  const { transport, messageUrl } = createCaptureTransport()

  const previews: { label: string; note: string; url: string | false; ics: boolean }[] = []

  for (const scenario of scenarios) {
    let hadAttachment = false

    // Stub only what sendRegistrationConfirmation actually touches, so the real
    // composition (subject, From, Reply-To, HTML, text, .ics) runs unchanged.
    const payload = {
      findGlobal: realFindGlobal ?? (async () => ({ emails: scenario.translations ?? {} })),
      logger: { debug() {}, error() {}, info() {}, warn() {} },
      sendEmail: async (message: Record<string, unknown>) => {
        const attachments = message.attachments as { filename?: string }[] | undefined
        hadAttachment = Boolean(attachments?.length)
        const info = await transport.sendMail({
          ...message,
          // Label the inbox row so scenarios are distinguishable at a glance;
          // the real subject stays visible inside the message.
          subject: `[${scenario.label}] ${String(message.subject)}`,
        } as never)
        previews.push({
          label: scenario.label,
          note: scenario.note,
          url: messageUrl(info),
          ics: hadAttachment,
        })
      },
    }

    await sendRegistrationConfirmation({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
      event: scenario.event,
      client: scenario.client,
      registrantName: scenario.registrantName ?? 'Jo Smith',
      registrantEmail: 'registrant@example.com',
      locale: scenario.locale ?? 'en',
      registrationUuid: `preview-${scenario.event.id}`,
    })
  }

  console.log('\n━━━ Registration confirmation email previews ━━━\n')
  console.log(
    fromDb
      ? 'Source: real services + events from the local database (read-only)'
      : 'Source: in-memory fixtures (set FROM_DB=1 for real data)',
  )
  console.log(
    `
Mailpit inbox (all messages): ${process.env.MAILPIT_URL ?? '(set MAILPIT_URL)'}`,
  )
  console.log('  credentials: MAILPIT_UI_AUTH in .env.claude.local — messages kept 7 days')
  console.log(`\nIcons resolve against: ${process.env.SAHAJCLOUD_URL}`)
  console.log(`\nDirect preview links:\n`)
  for (const { label, note, url, ics } of previews) {
    console.log(`  ${label}`)
    console.log(`    ${url}`)
    console.log(`    ${ics ? '📎 invite.ics' : '(no calendar)'} — ${note}\n`)
  }
  console.log(
    'Download invite.ics from any message and import it into Google Calendar and\n' +
      'Apple Calendar to verify the recurrence, timezone, and excluded dates.\n',
  )

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
