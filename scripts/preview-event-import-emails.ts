/**
 * Operator script: send the class import's "ready to review" email
 * (`EventImportSummaryEmail`, #907) to a Mailpit capture inbox, for visual
 * review. Prints a direct preview link per scenario.
 *
 * Usage:
 *   pnpm tsx scripts/preview-event-import-emails.ts
 *
 * No database is touched. ⚠ **It drives the real sender, `sendImportSummary`**,
 * so the subject, the brand and every line are what an import sends. The
 * `payload` stub answers only the uploader read, and hands the mail to Mailpit.
 */

import type { PayloadRequest } from 'payload'

import dotenv from 'dotenv'

import type { ImportRun, SkippedRow } from '@/plugins/eventImport/run'

import { createCaptureTransport } from './mailpit-transport'

// Shell env wins, then .env.local, then .env (see seeds/env.ts).
dotenv.config({ path: ['.env.local', '.env'] })

// Absolute icon URLs must resolve for the reviewer. Default to production,
// since the Mailpit viewer cannot reach a localhost URL.
process.env.SAHAJCLOUD_URL ||= 'https://cloud.sydevelopers.com'

const skippedRow = (row: number, reasons: string[]): SkippedRow => ({ row, reasons, values: {} })

const SCENARIOS: { label: string; note: string; imported: number; skipped: SkippedRow[] }[] = [
  {
    label: 'all created',
    note: 'every row became a draft — no skipped section',
    imported: 12,
    skipped: [],
  },
  {
    label: 'some skipped',
    note: 'drafts plus the three kinds of skipped row: a value, a missing city, a duplicate',
    imported: 7,
    skipped: [
      skippedRow(9, ['startTime must be HH:MM in 24-hour format (got "7pm")']),
      skippedRow(12, ['no city region for "Oxford" under United Kingdom — create it first']),
      skippedRow(15, ['this class is already listed as "Tuesday Evening Meditation"']),
    ],
  },
  {
    label: 'one class',
    note: 'singular wording',
    imported: 1,
    skipped: [],
  },
  {
    label: 'nothing created',
    note: 'every row skipped — the email asks for attention instead',
    imported: 0,
    skipped: [
      skippedRow(2, [
        'you are not allowed to add classes in this row’s city — ask an admin, or remove the row',
      ]),
      skippedRow(3, [
        'you are not allowed to add classes in this row’s city — ask an admin, or remove the row',
      ]),
    ],
  },
  {
    label: 'long list',
    note: 'more skipped rows than the email lists — the rest are counted',
    imported: 40,
    skipped: Array.from({ length: 26 }, (_, index) =>
      skippedRow(index + 2, [`date is in the past (got "2025-0${(index % 9) + 1}-01")`]),
    ),
  },
]

async function main() {
  const { sendImportSummary } = await import('@/plugins/eventImport/summaryEmail')
  const { transport, messageUrl } = createCaptureTransport()
  const previews: { label: string; note: string; url: false | string }[] = []

  for (const scenario of SCENARIOS) {
    const req = {
      payload: {
        findByID: async () => ({ email: 'volunteer-preview@example.com', type: 'manager' }),
        sendEmail: async (message: { html: string; subject: string; from: string; to: string }) => {
          const info = await transport.sendMail({
            ...message,
            // Label the inbox row; the real subject follows it.
            subject: `[${scenario.label}] ${message.subject}`,
          })
          previews.push({ label: scenario.label, note: scenario.note, url: messageUrl(info) })
        },
        logger: console,
      },
    } as unknown as PayloadRequest
    const run = {
      importId: 42,
      target: { id: 7, level: 'country', name: 'United Kingdom', mapboxId: 'country.gb' },
      managerId: 1,
      imported: scenario.imported,
      skipped: scenario.skipped,
    } as ImportRun
    if (!(await sendImportSummary({ req, run }))) throw new Error(`${scenario.label}: not sent`)
  }

  console.log('\n━━━ Class import email previews ━━━\n')
  console.log(`Mailpit inbox (all messages): ${process.env.MAILPIT_URL ?? '(set MAILPIT_URL)'}`)
  console.log('  credentials: MAILPIT_UI_AUTH in .env.claude.local — messages kept 7 days')
  console.log(`\nLinks resolve against: ${process.env.SAHAJCLOUD_URL}`)
  console.log(`\nDirect preview links:\n`)
  for (const { label, note, url } of previews) {
    console.log(`  ${label}`)
    console.log(`    ${url}`)
    console.log(`    ${note}\n`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
