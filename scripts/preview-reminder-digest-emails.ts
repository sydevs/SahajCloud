/**
 * Operator script: send the two scheduled emails — the registrant session
 * reminder (#589) and a manager's per-role digest (#1070) — in each
 * meaningful state to the Mailpit capture inbox, for visual review.
 * Prints a direct preview link per scenario.
 *
 * Usage:
 *   pnpm tsx scripts/preview-reminder-digest-emails.ts
 *
 * No database is touched. Both halves drive the real send paths
 * (`sendSessionReminder` and `sendDigest`) through a stub `payload` covering
 * `findGlobal`, `sendEmail`, `logger` and `secret`, so the subject, `From`,
 * `Reply-To`, HTML and plain-text part are composed as a job composes them.
 * The reminder's inputs are fixture events run through the real builders; the
 * digest's props are hand-written here rather than built by `buildDigest`, so
 * they show the template's states, not what a run would select.
 *
 * Header logos use absolute URLs. `SAHAJCLOUD_URL` defaults to
 * production, so the icon and the unsubscribe link's origin both
 * resolve in the preview.
 */

import type { DigestEmailProps, DigestRegistrationGroup, ItemTableRow } from '@/emails/DigestEmail'
import type { EmailClient } from '@/lib/notifications/sendRegistrationConfirmation'
import type { LocaleCode } from '@/lib/locales'
import type { Event, Manager } from '@/payload-types'

import { Temporal } from '@js-temporal/polyfill'
import dotenv from 'dotenv'

import { SPAM_SIGNUPS_PATH } from '@/lib/atlasOverview/refusals'

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
  logo: null, // no Cloudflare image locally: falls back to the Atlas icon
  websiteUrl: 'https://www.sahajayogalondon.example',
  supportEmail: 'hello@sahajayogalondon.example',
}

/**
 * A partly-translated German `emails` group for the reminder.
 * `reminder_subject`, `unsubscribe_cta`, and others are left out on
 * purpose, so the per-key English fallback shows in the rendered mail.
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

/** A manager the digest can reach: an address, and the `open_items` method it reads. */
const digestManager = (name: string): Manager =>
  ({
    email: 'manager@example.com',
    id: 1,
    name,
    notificationPreferences: { open_items: { frequency: 'Monthly', method: 'email' } },
  }) as unknown as Manager

const ADMIN = 'https://cloud.sydevelopers.com/admin/collections/events'
const SUBMISSIONS = 'https://cloud.sydevelopers.com/admin/collections/user-submissions'

interface DigestScenario {
  label: string
  manager: Manager
  note: string
  props: DigestEmailProps
}

// Realistic answers drawn from EVENT_REGISTRATION_QUESTIONS, cycled through so
// the high-volume scenario shows a mix of full, partial and empty ones.
const QA: string[] = [
  'Have you practised Sahaja Yoga meditation before?: No, this is my first time · How did you hear about this event?: A friend recommended it',
  'How did you hear about this event?: Instagram · Will you be bringing any guests?: 2 guests',
  'Have you practised Sahaja Yoga meditation before?: Yes, occasionally · Is there anything about your health we should know?: Recovering from a knee injury',
  '', // some registrants leave every optional question blank
  'How did you hear about this event?: Google search',
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

const SHELL = {
  dashboardUrl: 'https://cloud.sydevelopers.com/admin/',
  date: '5 November 2026',
  notificationsUrl: 'https://cloud.sydevelopers.com/admin/account',
}

/**
 * A busy manager's week: many events, each with a different number of
 * registrations, and most carrying answers. Deterministic and index-driven
 * with no RNG, so re-runs match. The point is to judge how manageable a dense
 * digest reads.
 */
function buildStressGroups(): DigestRegistrationGroup[] {
  const events = [
    { count: 8, title: 'Monday Morning Meditation — Camden' },
    { count: 3, title: 'Tuesday Evening Class — Islington' },
    { count: 6, title: 'Wednesday Lunchtime Sit — City of London' },
    { count: 2, title: 'Thursday Beginners Course — Hackney' },
    { count: 7, title: 'Friday Family Meditation — Greenwich' },
    { count: 4, title: 'Saturday Morning Class — Richmond' },
    { count: 5, title: 'Sunday Introduction — Croydon' },
  ] // ~35 registrations across 7 events
  let person = 0
  return events.map(({ count, title }, e) => ({
    allUrl: `${ADMIN}/${2000 + e}/registrations`,
    heading: `${title} · ${count} new`,
    rows: Array.from({ length: count }, (_, r) => {
      const name = NAMES[person % NAMES.length]!
      const answers = QA[person % QA.length]!
      person += 1
      return {
        answers: answers || undefined,
        attending: r % 3 === 0 ? '5 Aug 2025' : null,
        email: `${name.split(' ')[0]!.toLowerCase()}${person}@example.com`,
        name,
      }
    }),
  }))
}

const OPEN_ROWS: ItemTableRow[] = [
  {
    action: { href: `${ADMIN}/1041`, label: 'Verify' },
    href: `${ADMIN}/1041`,
    statuses: [
      { line: 'Unpublishes 12 Nov 2026', pillStyle: 'error', text: 'Overdue' },
      {
        line: 'Add photos, Improve the event description',
        pillStyle: 'light-gray',
        text: '2 recommendations',
      },
    ],
    title: 'Tuesday Evening Meditation',
  },
  {
    action: { href: `${SUBMISSIONS}/5120`, label: 'Review' },
    href: `${SUBMISSIONS}/5120`,
    statuses: [
      {
        line: 'Address › City, Schedule › Start Time · received 3 Nov 2026',
        pillStyle: 'success',
        text: 'Change proposed',
      },
    ],
    title: 'Saturday Morning Meditation',
  },
  {
    action: { href: `${ADMIN}/1044`, label: 'Assign manager' },
    href: `${ADMIN}/1044`,
    statuses: [{ line: 'Added 28 Oct 2026', pillStyle: 'warning', text: 'No manager' }],
    title: 'Introduction to Meditation — Open Day',
  },
]

const DIGEST_SCENARIOS: DigestScenario[] = [
  {
    label: 'digest · program · open items + registrations',
    manager: digestManager('Priya Deshmukh'),
    note: 'the common program email: what is open, then who signed up',
    props: {
      ...SHELL,
      heading: 'Your programs',
      openItems: { rows: OPEN_ROWS.slice(0, 2) },
      recipientName: 'Priya Deshmukh',
      registrations: buildStressGroups().slice(0, 2),
      statistics: [
        {
          heading: 'Analytics',
          tiles: [
            { change: '+2 in 30 days', label: 'Total programs', value: '6' },
            { change: '+11 in 30 days', label: 'Registrations', value: '34' },
            { label: 'Programs with a sign-up', of: '6', value: '4' },
          ],
        },
      ],
      summary: '2 open items · 11 new registrations · November analytics',
    },
  },
  {
    label: 'digest · region · statistics + open items',
    manager: digestManager('Sam Okafor'),
    note: 'two tile blocks, and a list holding none of their own programs',
    props: {
      ...SHELL,
      heading: 'Your regions',
      openItems: { rows: OPEN_ROWS },
      recipientName: 'Sam Okafor',
      statistics: [
        {
          heading: 'Verification health',
          tiles: [
            { change: '+4 in 30 days', label: 'Verified', value: '58' },
            { change: '-1 in 30 days', label: 'Escalated', value: '3' },
            { change: '+0 in 30 days', label: 'Urgent', value: '1' },
            { change: null, label: 'Expired', value: '0' },
            { change: '+2 in 30 days', label: 'Unverified', value: '7' },
          ],
        },
        {
          heading: 'Analytics',
          tiles: [
            { change: '+5 in 30 days', label: 'Total programs', value: '69' },
            { change: '-3 in 30 days', label: 'Registrations', value: '112' },
            { label: 'Programs with a sign-up', of: '69', value: '31' },
          ],
        },
      ],
      summary: '3 open items · November analytics',
    },
  },
  {
    label: 'digest · admin · refused sign-ups + closing line',
    manager: digestManager('Rosa Delgado'),
    note: 'the one email that counts the sign-ups filed as spam',
    props: {
      ...SHELL,
      closingNote: {
        href: `https://cloud.sydevelopers.com/admin${SPAM_SIGNUPS_PATH}`,
        text: '27 sign-ups filed as spam in the last 7 days',
      },
      heading: 'Sahaj Atlas',
      openItems: {
        rows: [
          ...OPEN_ROWS.slice(2),
          {
            action: { href: `${SUBMISSIONS}/5400`, label: 'Review' },
            href: `${SUBMISSIONS}/5400`,
            statuses: [
              {
                line: 'repeatedly refused sender · 4 Nov 2026',
                pillStyle: 'success',
                text: 'Flagged as spam',
              },
            ],
            title: 'Nadia Haddad',
          },
        ],
      },
      recipientName: 'Rosa Delgado',
      summary: '2 open items',
    },
  },
  {
    label: 'digest · program · high volume',
    manager: digestManager('Lena Novak'),
    note: '~35 registrations across 7 events — how manageable is a busy week?',
    props: {
      ...SHELL,
      heading: 'Your programs',
      recipientName: 'Lena Novak',
      registrations: buildStressGroups(),
      summary: '35 new registrations',
    },
  },
]

type Preview = { label: string; note: string; url: string | false }

async function main() {
  const nodemailer = (await import('nodemailer')).default
  const { sendSessionReminder } =
    await import('@/jobs/RegistrationNotifications/sendSessionReminder')
  const { sendDigest } = await import('@/jobs/Digests/SendDigests')

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
      submissionId: s.event.id,
      // The single occurrence to remind about: the class's next session.
      occurrenceIso: (s.event.schedule as { firstDate: string }).firstDate,
    })
    previews[previews.length - 1].note = s.note
  }

  for (const s of DIGEST_SCENARIOS) {
    await sendDigest({
      manager: s.manager,
      payload: stubPayload(s.label),
      props: s.props,
    })
    previews[previews.length - 1].note = s.note
  }

  console.log('\n━━━ Session reminder + manager digest email previews ━━━\n')
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
