/**
 * Operator script: send the bulk-import summary (#828) in each meaningful
 * state to the Mailpit capture inbox, for visual review. Prints a direct
 * preview link per scenario.
 *
 * Usage:
 *   pnpm tsx scripts/preview-event-import-emails.ts
 *
 * No database is touched. The script drives the real send path
 * (`sendImportSummary`) through a stub `payload` that covers only the three
 * calls it makes — the admin read, `sendEmail`, and `logger`. So the subject,
 * the `From`, the brand and every line are the ones a real commit produces,
 * and this preview cannot drift from it.
 *
 * Header logos and both buttons use absolute URLs. `SAHAJCLOUD_URL` defaults
 * to production so they resolve in the preview.
 */

import type { EventImportSummaryCounts } from '@/emails/EventImportSummaryEmail'

import dotenv from 'dotenv'

import { createCaptureTransport } from './mailpit-transport'

// Shell env wins, then .env.local, then .env (see seeds/env.ts).
dotenv.config({ path: ['.env.local', '.env'] })

process.env.SAHAJCLOUD_URL ||= 'https://cloud.sydevelopers.com'

interface Scenario {
  label: string
  note: string
  uploaderName: string
  targetName: string
  counts: EventImportSummaryCounts
  /** Empty for the install with no admin, which falls back to the system contact. */
  admins?: string[]
}

const SCENARIOS: Scenario[] = [
  {
    label: 'import · a country’s first batch',
    note: 'both class kinds, both skip reasons, and most coordinators newly created',
    uploaderName: 'Priya Deshmukh',
    targetName: 'India',
    counts: {
      verified: 37,
      unverified: 182,
      duplicates: 14,
      errors: 6,
      regionsAdded: 48,
      coordinators: 31,
      coordinatorsCreated: 27,
    },
  },
  {
    label: 'import · nothing skipped',
    note: 'every row landed — the skipped section is absent rather than a row of zeroes',
    uploaderName: 'Lukas Bauer',
    targetName: 'Bayern',
    counts: {
      verified: 9,
      unverified: 0,
      duplicates: 0,
      errors: 0,
      regionsAdded: 3,
      coordinators: 4,
      coordinatorsCreated: 0,
    },
  },
  {
    label: 'import · one class',
    note: 'the singular, in the subject, the opening line and the account count',
    uploaderName: 'Ana Silva',
    targetName: 'Lisboa',
    counts: {
      verified: 0,
      unverified: 1,
      duplicates: 0,
      errors: 0,
      regionsAdded: 1,
      coordinators: 1,
      coordinatorsCreated: 1,
    },
  },
  {
    label: 'import · nothing committed',
    note: 'a batch whose every row was refused — still reported, and still deleted',
    uploaderName: 'Sam Okafor',
    targetName: 'Greater London',
    counts: {
      verified: 0,
      unverified: 0,
      duplicates: 3,
      errors: 11,
      regionsAdded: 0,
      coordinators: 0,
      coordinatorsCreated: 0,
    },
  },
  {
    label: 'import · no admin on file',
    note: 'the system-contact fallback, which is the only thing that differs',
    uploaderName: 'Priya Deshmukh',
    targetName: 'India',
    admins: [],
    counts: {
      verified: 2,
      unverified: 5,
      duplicates: 0,
      errors: 0,
      regionsAdded: 2,
      coordinators: 2,
      coordinatorsCreated: 2,
    },
  },
]

const DEFAULT_ADMINS = ['first.admin@example.com', 'second.admin@example.com']

type Preview = { label: string; note: string; to: string; url: string | false }

async function main() {
  const { sendImportSummary } = await import('@/collections/EventImports/commit/summaryEmail')
  const { transport, messageUrl } = createCaptureTransport()

  const previews: Preview[] = []

  for (const scenario of SCENARIOS) {
    const admins = scenario.admins ?? DEFAULT_ADMINS
    let to = ''

    const req = {
      payload: {
        logger: { debug() {}, error() {}, info() {}, warn() {} },
        find: async () => ({ docs: admins.map((email) => ({ email })) }),
        sendEmail: async (message: Record<string, unknown>) => {
          to = (message.to as string[]).join(', ')
          const info = await transport.sendMail({
            ...message,
            subject: `[${scenario.label}] ${String(message.subject)}`,
          } as never)
          previews.push({ label: scenario.label, note: scenario.note, to, url: messageUrl(info) })
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    await sendImportSummary(req, {
      uploaderName: scenario.uploaderName,
      // Any region id: the button is a link, and nothing reads the row.
      targetId: 42,
      targetName: scenario.targetName,
      counts: scenario.counts,
    })
  }

  console.log('\n━━━ Bulk event import summary email previews (#828) ━━━\n')
  console.log(`Mailpit inbox (all messages): ${process.env.MAILPIT_URL ?? '(set MAILPIT_URL)'}`)
  console.log('  credentials: MAILPIT_UI_AUTH in .env.claude.local — messages kept 7 days')
  console.log(`\nIcons and both buttons resolve against: ${process.env.SAHAJCLOUD_URL}`)
  console.log('\nDirect preview links:\n')
  for (const { label, note, to, url } of previews) {
    console.log(`  ${label}`)
    console.log(`    ${url}`)
    console.log(`    to: ${to}`)
    console.log(`    ${note}\n`)
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
