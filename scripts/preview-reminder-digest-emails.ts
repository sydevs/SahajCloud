/**
 * Operator script: send the #589 scheduled emails — the registrant **session
 * reminder** and the manager **registration digest** — in each meaningful state
 * to the Mailpit capture inbox for visual review. Prints a direct preview link
 * per scenario.
 *
 * Usage:
 *   pnpm tsx scripts/preview-reminder-digest-emails.ts
 *
 * No database is touched. The script drives the **real** send paths
 * (`sendSessionReminder` / `sendRegistrationDigest`) through a stub `payload`
 * (its only Payload touchpoints are `findGlobal`, `sendEmail`, `logger`, and
 * `secret`), so what you see is what the jobs send: same subject, `From`,
 * `Reply-To`, HTML, and plain-text part. Nothing is reimplemented here, so this
 * preview can't drift from production behaviour.
 *
 * Header logos are absolute URLs. `SAHAJCLOUD_URL` defaults to production so the
 * icon (and the unsubscribe link's origin) resolve in the preview.
 */

import type { DigestEventGroup, DigestPeriod } from '@/emails/RegistrationDigestEmail'
import type { EmailClient } from '@/lib/notifications/sendRegistrationConfirmation'
import type { RegistrationRecipient } from '@/lib/notifications'
import type { LocaleCode } from '@/lib/locales'
import type { Event } from '@/payload-types'

import { Temporal } from '@js-temporal/polyfill'
import dotenv from 'dotenv'
import { createCaptureTransport } from './mailpit-transport'

// Shell env wins, then .env.local, then .env (see seeds/env.ts).
dotenv.config({ path: ['.env.local', '.env'] })

process.env.SAHAJCLOUD_URL ||= 'https://cloud.sydevelopers.com'

const LONDON = 'Europe/London'
const TUESDAY = 2
const SATURDAY = 6

/** The next occurrence of `weekday` at `hour`:00 local time in `tz`, ≥ 3 days out, as a UTC ISO string. */
function nextLocalOccurrence(weekday: number, hour: number, tz: string): string {
  let zdt = Temporal.Now.zonedDateTimeISO(tz)
    .add({ days: 3 })
    .with({ hour, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
  while (zdt.dayOfWeek !== weekday) zdt = zdt.add({ days: 1 })
  return new Date(Number(zdt.epochMilliseconds)).toISOString()
}

const COURSE_START = nextLocalOccurrence(TUESDAY, 19, LONDON)
const SATURDAY_START = nextLocalOccurrence(SATURDAY, 10, LONDON)

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

/** A weekly 19:00 London online class. */
const onlineEvent = {
  id: 1042,
  title: 'Tuesday Evening Meditation',
  eventType: 'online',
  onlineUrl: 'https://meet.example.com/tuesday-meditation-abc-def',
  contactName: 'Priya Deshmukh',
  contactPhone: '+44 20 7946 0000',
  schedule: {
    firstDate: COURSE_START,
    firstDate_tz: LONDON,
    recurrenceType: 'WEEKLY',
    interval: 1,
    weekdays: ['TU'],
    endTime: '20:30',
  },
} as unknown as Event

/** A weekly 10:00 London in-person class. */
const offlineEvent = {
  id: 1043,
  title: 'Saturday Morning Meditation',
  eventType: 'offline',
  address: ADDRESS,
  contactName: 'Priya Deshmukh',
  contactPhone: '+44 20 7946 0000',
  schedule: {
    firstDate: SATURDAY_START,
    firstDate_tz: LONDON,
    recurrenceType: 'WEEKLY',
    weekdays: ['SA'],
    endTime: '11:30',
  },
} as unknown as Event

/** A branded client service. */
const brandedClient: EmailClient = {
  name: 'Sahaja Yoga London',
  color1: '#7B4EA8',
  color2: '#B08BD4',
  logo: null, // no Cloudflare image locally — falls back to the Atlas icon
  websiteUrl: 'https://www.sahajayogalondon.example',
  supportEmail: 'hello@sahajayogalondon.example',
}

/**
 * A partly-translated German `emails` group for the reminder — `reminder_subject`,
 * `unsubscribe_cta`, and others are deliberately omitted so the per-key English
 * fallback is visible in the rendered mail.
 */
const GERMAN_EMAILS = {
  reminder_heading: 'Deine Klasse ist morgen',
  reminder_intro: 'Hallo %{name}, eine kurze Erinnerung an deine bevorstehende Klasse.',
  reminder_footer_reason:
    'Du erhältst diese Erinnerung, weil du dich für diese Klasse angemeldet hast.',
  when_label: 'Wann',
  where_label: 'Wo',
  online_cta: 'Online teilnehmen',
  online_link_hint: 'Falls der Button nicht funktioniert, kopiere diesen Link:',
}

interface ReminderScenario {
  label: string
  note: string
  event: Event
  client: EmailClient | null
  locale?: LocaleCode
  translations?: Record<string, unknown>
  registrantName?: string
}

const REMINDER_SCENARIOS: ReminderScenario[] = [
  {
    label: 'reminder · online · branded',
    note: 'join URL as CTA *and* plain text; single next occurrence; unsubscribe in the footer',
    event: onlineEvent,
    client: brandedClient,
  },
  {
    label: 'reminder · offline · branded',
    note: 'address + a Get Directions button, no join-link section',
    event: offlineEvent,
    client: brandedClient,
  },
  {
    label: 'reminder · online · german',
    note: 'partly-translated locale — untranslated keys (subject, unsubscribe) fall back to English',
    event: onlineEvent,
    client: brandedClient,
    locale: 'de',
    translations: GERMAN_EMAILS,
    registrantName: 'Lukas Bauer',
  },
  {
    label: 'reminder · online · unbranded',
    note: 'no client — falls back to the Atlas project brand',
    event: onlineEvent,
    client: null,
  },
]

const managerRecipient = (name: string): RegistrationRecipient => ({
  destination: 'manager@example.com',
  name,
  channel: 'email',
  frequency: 'Daily Summary',
})

const ADMIN = 'https://cloud.sydevelopers.com/admin/collections/events'

interface DigestScenario {
  label: string
  note: string
  recipient: RegistrationRecipient
  period: DigestPeriod
  groups: DigestEventGroup[]
}

// Realistic Q&A drawn from EVENT_REGISTRATION_QUESTIONS, cycled through so the
// high-volume scenario shows a mix of fully / partly / un-answered registrations.
const QA: { label: string; value: string }[][] = [
  [
    {
      label: 'Have you practised Sahaja Yoga meditation before?',
      value: 'No, this is my first time',
    },
    { label: 'How did you hear about this event?', value: 'A friend recommended it' },
  ],
  [
    { label: 'How did you hear about this event?', value: 'Instagram' },
    { label: 'Will you be bringing any guests?', value: '2 guests' },
  ],
  [
    { label: 'Have you practised Sahaja Yoga meditation before?', value: 'Yes, occasionally' },
    {
      label: 'Is there anything about your health we should know?',
      value: 'Recovering from a knee injury — I may need to sit on a chair.',
    },
    { label: 'Do you have any accessibility requirements?', value: 'Step-free access, please' },
  ],
  [], // some registrants answer nothing optional
  [{ label: 'How did you hear about this event?', value: 'Google search' }],
]

const NAMES = [
  'Alice Nguyen',
  'Bob Fernández',
  'Cara Silva',
  'Dana Petrova',
  'Ewan MacLeod',
  'Fatima Al-Sayed',
  'Gio Rossi',
  'Hana Kim',
  'Ivan Petrov',
  'Julia Weber',
  'Kwame Mensah',
  'Lena Novak',
  'Mateo Díaz',
  'Nadia Haddad',
  'Omar Farouk',
]

/**
 * A busy manager's week: many events, each with a different number of
 * registrations, most carrying answers. Deterministic (index-driven, no RNG) so
 * re-runs match — the point is to judge how manageable a dense digest reads.
 */
function buildStressGroups(): DigestEventGroup[] {
  const events = [
    { title: 'Monday Morning Meditation — Camden', count: 8 },
    { title: 'Tuesday Evening Class — Islington', count: 3 },
    { title: 'Wednesday Lunchtime Sit — City of London', count: 6 },
    { title: 'Thursday Beginners Course — Hackney', count: 2 },
    { title: 'Friday Family Meditation — Greenwich', count: 7 },
    { title: 'Saturday Morning Class — Richmond', count: 4 },
    { title: 'Sunday Introduction — Croydon', count: 5 },
  ] // ~35 registrations across 7 events
  let person = 0
  return events.map(({ title, count }, e) => ({
    eventTitle: title,
    eventAdminUrl: `${ADMIN}/${2000 + e}`,
    registrations: Array.from({ length: count }, (_, r) => {
      const name = NAMES[person % NAMES.length]
      const answers = QA[person % QA.length]
      person += 1
      return {
        registrantName: name,
        registrantEmail: `${name.split(' ')[0].toLowerCase()}${person}@example.com`,
        startDate: r % 3 === 0 ? '5 Aug 2025' : null,
        answers,
      }
    }),
  }))
}

const DIGEST_SCENARIOS: DigestScenario[] = [
  {
    label: 'digest · daily · two events',
    note: 'registrations grouped across two events, each an itemised card with answers',
    recipient: managerRecipient('Priya Deshmukh'),
    period: 'day',
    groups: [
      {
        eventTitle: 'Tuesday Evening Meditation',
        eventAdminUrl: `${ADMIN}/1042`,
        registrations: [
          {
            registrantName: 'Alice Nguyen',
            registrantEmail: 'alice@example.com',
            startDate: null,
            answers: QA[0],
          },
          {
            registrantName: 'Bob Fernández',
            registrantEmail: 'bob@example.com',
            startDate: '5 Aug 2025',
            answers: QA[2],
          },
        ],
      },
      {
        eventTitle: 'Saturday Morning Meditation',
        eventAdminUrl: `${ADMIN}/1043`,
        registrations: [
          {
            registrantName: 'Cara Silva',
            registrantEmail: 'cara@example.com',
            startDate: null,
            answers: QA[1],
          },
        ],
      },
    ],
  },
  {
    label: 'digest · weekly · one event',
    note: 'single registration — total reads "1 registration", weekly period phrasing',
    recipient: { ...managerRecipient('Sam Okafor'), frequency: 'Weekly Summary' },
    period: 'week',
    groups: [
      {
        eventTitle: 'Introduction to Meditation — Open Day',
        eventAdminUrl: `${ADMIN}/1044`,
        registrations: [
          {
            registrantName: 'Dana Petrova',
            registrantEmail: 'dana@example.com',
            startDate: null,
            answers: QA[4],
          },
        ],
      },
    ],
  },
  {
    label: 'digest · weekly · high volume',
    note: '~35 registrations across 7 events with answers — how manageable is a busy week?',
    recipient: { ...managerRecipient('Rosa Delgado'), frequency: 'Weekly Summary' },
    period: 'week',
    groups: buildStressGroups(),
  },
]

type Preview = { label: string; note: string; url: string | false }

async function main() {
  const nodemailer = (await import('nodemailer')).default
  const { sendSessionReminder } = await import('@/jobs/RegistrationNotifications/sendSessionReminder')
  const { sendRegistrationDigest } = await import('@/jobs/RegistrationNotifications/sendRegistrationDigest')

  const { transport, messageUrl } = createCaptureTransport()

  const previews: Preview[] = []

  /** Stub only what the send paths touch, so the real composition runs unchanged. */
  const stubPayload = (label: string, translations?: Record<string, unknown>) =>
    ({
      secret: 'preview-secret-for-unsubscribe-token',
      findGlobal: async () => ({ emails: translations ?? {} }),
      logger: { debug() {}, error() {}, info() {}, warn() {} },
      sendEmail: async (message: Record<string, unknown>) => {
        const info = await transport.sendMail({
          ...message,
          subject: `[${label}] ${String(message.subject)}`,
        } as never)
        previews.push({ label, note: '', url: messageUrl(info) })
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any

  for (const s of REMINDER_SCENARIOS) {
    await sendSessionReminder({
      payload: stubPayload(s.label, s.translations),
      event: s.event,
      client: s.client,
      registrantName: s.registrantName ?? 'Jo Smith',
      registrantEmail: 'registrant@example.com',
      locale: s.locale ?? 'en',
      registrationId: s.event.id,
      // The single occurrence to remind about — the class's next session.
      occurrenceIso: (s.event.schedule as { firstDate: string }).firstDate,
    })
    previews[previews.length - 1].note = s.note
  }

  for (const s of DIGEST_SCENARIOS) {
    await sendRegistrationDigest({
      payload: stubPayload(s.label),
      recipient: s.recipient,
      period: s.period,
      groups: s.groups,
    })
    previews[previews.length - 1].note = s.note
  }

  console.log('\n━━━ Session reminder + registration digest email previews (#589) ━━━\n')
  console.log(`Mailpit inbox (all messages): ${process.env.MAILPIT_URL ?? '(set MAILPIT_URL)'}`)
  console.log('  credentials: MAILPIT_UI_AUTH in .env.claude.local — messages kept 7 days')
  console.log(`\nIcons + unsubscribe origin resolve against: ${process.env.SAHAJCLOUD_URL}`)
  console.log(`\nDirect preview links:\n`)
  for (const { label, note, url } of previews) {
    console.log(`  ${label}`)
    console.log(`    ${url}`)
    console.log(`    ${note}\n`)
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
