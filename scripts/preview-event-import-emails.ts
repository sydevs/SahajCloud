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
 * `payload` stub hands the mail to Mailpit.
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

const error = (row: number): SkippedRow => ({ row, reasons: ['a reason'], values: {} })
const duplicate = (row: number): SkippedRow => ({ ...error(row), duplicateOf: { row: 2 } })
const rows = (count: number, make: (row: number) => SkippedRow) =>
  Array.from({ length: count }, (_, index) => make(index + 3))

const SCENARIOS: { label: string; note: string; imported: number; skipped: SkippedRow[] }[] = [
  { label: 'all created', note: 'every row became a draft', imported: 12, skipped: [] },
  {
    label: 'mixed',
    note: 'drafts, duplicates and errors — one line each',
    imported: 7,
    skipped: [...rows(2, duplicate), ...rows(3, error)],
  },
  { label: 'one class', note: 'singular wording', imported: 1, skipped: rows(1, error) },
  {
    label: 'nothing created',
    note: 'every row skipped — the email asks for attention instead',
    imported: 0,
    skipped: rows(4, error),
  },
]

async function main() {
  const { sendImportSummary } = await import('@/plugins/eventImport/summaryEmail')
  const { transport, messageUrl } = createCaptureTransport()
  const previews: { label: string; note: string; url: false | string }[] = []

  for (const scenario of SCENARIOS) {
    const req = {
      payload: {
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
      uploader: { email: 'volunteer-preview@example.com', type: 'manager' },
      created: Array.from({ length: scenario.imported }, (_, index) => ({
        row: index + 2,
        values: {},
        eventId: index + 1,
      })),
      skipped: scenario.skipped,
    } as unknown as ImportRun
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
