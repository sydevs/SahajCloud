/**
 * Operator script: send the manager-facing registration-notification
 * email (`EventRegistrationEmail`, #588) in each of its meaningful
 * states to a Mailpit capture inbox, for visual review. Prints a direct
 * preview link per scenario.
 *
 * Usage:
 *   pnpm tsx scripts/preview-registration-notification-emails.ts
 *
 * No database is touched. The script drives the real
 * `sendRegistrationNotification()` path through a stub `payload` object.
 * That stub only covers `sendEmail` and `logger`, the only Payload calls
 * this path makes. So what you see is what the endpoint sends: the same
 * `Subject`, `From`, and HTML. Nothing here is reimplemented, so this
 * preview cannot drift from production behavior.
 *
 * Header logos and the "View event" button use absolute URLs.
 * `SAHAJCLOUD_URL` defaults to production here, so both resolve in the
 * preview. Override it to point elsewhere.
 */

import type { RegistrationRecipient } from '@/lib/notifications/registrationRecipient'
import type { Event } from '@/payload-types'

import dotenv from 'dotenv'
import { createCaptureTransport } from './mailpit-transport'

// Shell env wins, then .env.local, then .env (see seeds/env.ts).
dotenv.config({ path: ['.env.local', '.env'] })

// Absolute icon and admin-link URLs must resolve for the reviewer.
// Default to production, since the Mailpit viewer cannot reach a localhost URL.
process.env.SAHAJCLOUD_URL ||= 'https://cloud.sydevelopers.com'

/** N days from now at 19:00 UTC as an ISO string. This is the session time the registrant chose. */
function daysFromNow(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(19, 0, 0, 0)
  return date.toISOString()
}

/** A named manager recipient (email channel, Immediate cadence). */
const managerRecipient: RegistrationRecipient = {
  destination: 'anna.manager@example.com',
  name: 'Anna Kightley',
  channel: 'email',
  frequency: 'Immediate',
}

/** A per-event override address, with no display name, so the greeting stays neutral. */
const overrideRecipient: RegistrationRecipient = {
  destination: 'events-team@example.org',
  name: null,
  channel: 'email',
  frequency: 'Immediate',
}

interface Scenario {
  label: string
  note: string
  recipient: RegistrationRecipient
  event: Pick<Event, 'id' | 'title'>
  registrantName: string
  registrantEmail: string
  startingAt?: string | null
  /** Raw registrant answers, keyed by question name. Shaped exactly as the endpoint shapes them. */
  questions?: Record<string, unknown>
}

const SCENARIOS: Scenario[] = [
  {
    label: 'manager · full',
    note: 'named manager — every row, forwarded answers, and the Reply CTA; greeting by name',
    recipient: managerRecipient,
    event: { id: 1042, title: 'Tuesday Evening Meditation' },
    registrantName: 'Jo Smith',
    registrantEmail: 'jo.smith@example.com',
    startingAt: daysFromNow(5),
    questions: {
      priorExperience: 'No, this is my first time',
      referralSource: 'A friend recommended it',
      guests: 'Bringing my partner',
    },
  },
  {
    label: 'override · neutral greeting',
    note: 'per-event override address (no display name) → "Hello there,"; one forwarded answer',
    recipient: overrideRecipient,
    event: { id: 1043, title: 'Saturday Morning Meditation' },
    registrantName: 'Priya Deshmukh',
    registrantEmail: 'priya.d@example.com',
    startingAt: daysFromNow(3),
    questions: { referralSource: 'Instagram' },
  },
  {
    label: 'manager · minimal',
    note: 'no start date and no answers → the Start date row and answers section both collapse',
    recipient: managerRecipient,
    event: { id: 1044, title: 'Introduction to Meditation — Open Day' },
    registrantName: 'Lukas Bauer',
    registrantEmail: 'lukas.bauer@example.com',
    startingAt: null,
  },
  {
    label: 'manager · long title',
    note: 'long title + sensitive answers forwarded — checks Subject/heading wrap and the answers block',
    recipient: managerRecipient,
    event: {
      id: 1045,
      title: 'Weekly Sahaja Yoga Meditation & Self-Realisation Workshop for Complete Beginners',
    },
    registrantName: 'María González',
    registrantEmail: 'maria.g@example.com',
    startingAt: daysFromNow(9),
    questions: {
      healthInfo: 'A knee injury — I may need to sit on a chair',
      accessibility: 'Step-free access, please',
    },
  },
]

async function main() {
  const nodemailer = (await import('nodemailer')).default
  const { sendRegistrationNotification } =
    await import('@/lib/notifications/sendRegistrationNotification')
  // Shape raw answers exactly as the endpoint does, so the preview cannot drift.
  const { buildRegistrationAnswers } = await import('@/lib/registrations/questions')

  const { transport, messageUrl } = createCaptureTransport()

  const previews: { label: string; note: string; url: string | false }[] = []

  for (const scenario of SCENARIOS) {
    // Stub only what sendRegistrationNotification touches: sendEmail and
    // logger. This keeps the real composition (Subject, From, HTML) unchanged.
    const payload = {
      logger: { debug() {}, error() {}, info() {}, warn() {} },
      sendEmail: async (message: Record<string, unknown>) => {
        const info = await transport.sendMail({
          ...message,
          // Label the inbox row so scenarios are distinguishable at a glance.
          // The real subject still appears inside the message.
          subject: `[${scenario.label}] ${String(message.subject)}`,
        } as never)
        previews.push({
          label: scenario.label,
          note: scenario.note,
          url: messageUrl(info),
        })
      },
    }

    await sendRegistrationNotification({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
      recipient: scenario.recipient,
      event: scenario.event,
      registrantName: scenario.registrantName,
      registrantEmail: scenario.registrantEmail,
      startingAt: scenario.startingAt,
      answers: buildRegistrationAnswers(scenario.questions),
    })
  }

  console.log('\n━━━ Manager registration-notification email previews ━━━\n')
  console.log('Source: in-memory fixtures')
  console.log(
    `
Mailpit inbox (all messages): ${process.env.MAILPIT_URL ?? '(set MAILPIT_URL)'}`,
  )
  console.log('  credentials: MAILPIT_UI_AUTH in .env.claude.local — messages kept 7 days')
  console.log(`\nIcons + "View event" link resolve against: ${process.env.SAHAJCLOUD_URL}`)
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
