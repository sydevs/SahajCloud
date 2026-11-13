#!/usr/bin/env node
/**
 * Send the one-off "Sahaj Atlas has moved" email to every active Atlas manager, once the final
 * sync has landed in production. Who counts as active: `selectRecipients`
 * (`./atlas-migration-recipients.ts`).
 *
 * shortcut: a one-off for the Atlas cutover, delete it, its template and its pure half once sent.
 *
 * Usage (nothing is sent without `--preview` or `--send --force`):
 *   pnpm tsx scripts/send-atlas-migration-email.ts                    # counts only
 *   pnpm tsx scripts/send-atlas-migration-email.ts --list             # and every recipient
 *   pnpm tsx scripts/send-atlas-migration-email.ts --html <file>      # render one, send nothing
 *   pnpm tsx scripts/send-atlas-migration-email.ts --preview <addr>   # send one to <addr>
 *   pnpm tsx scripts/send-atlas-migration-email.ts --send --force     # send to everyone
 *
 * `--as <email>` picks whose details a rendered or previewed email shows (default: the first
 * recipient, or a sample when there is none). `--ledger <file>` records each address sent, so a
 * re-run after a failure sends only the rest (default `seeds/atlas/local/migration-email-ledger.json`,
 * gitignored because it holds addresses).
 *
 * Against production, so the read is production's and the send goes through Resend:
 *   railway run --service SahajCloud -- env DATABASE_URL=<Postgres DATABASE_PUBLIC_URL> \
 *     pnpm tsx scripts/send-atlas-migration-email.ts --preview you@example.com
 *
 * The boot changes no schema (`./lib/payloadBoot.ts`) and the script writes nothing to the
 * database: the ledger is the only record of who was sent.
 */
import type { MigrationRecipient } from './atlas-migration-recipients'
import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { createElement } from 'react'

import {
  ATLAS_MIGRATION_SUBJECT,
  AtlasMigrationEmail,
  cmsHighlights,
} from '../src/emails/AtlasMigrationEmail'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '../src/plugins/email'
import { MANAGERS_COLLECTION, summarizeGrants } from '../src/plugins/login/grantSummary'
import { selectRecipients } from './atlas-migration-recipients'
import { exitAfterFlush, loadPayloadWithoutSchemaChanges } from './lib/payloadBoot'

const SIGN_IN_URL = 'https://cloud.sydevelopers.com/admin/login'
const MAP_URL = 'https://sahajatlas.com'
const DEFAULT_LEDGER = 'seeds/atlas/local/migration-email-ledger.json'
/** Resend's default limit is 2 requests a second. */
const SEND_SPACING_MS = 600

const SAMPLE: MigrationRecipient = {
  id: 0,
  email: 'manager@example.com',
  name: 'Sample Manager',
  holds: { events: 2, regions: 1, services: 1 },
}

/** What a sample recipient looks after, for a render against a database with no Atlas managers. */
const SAMPLE_SUMMARY = {
  responsibilities: [
    {
      label: 'Regions',
      singular: 'Region',
      items: [{ title: 'Sample City', url: 'https://sahajatlas.com/sample-city' }],
    },
    {
      label: 'Events',
      singular: 'Event',
      items: [
        { title: 'Evening Meditation at the Library', url: 'https://sahajatlas.com/sample-city/1' },
        { title: 'Morning Meditation Online', url: null },
      ],
    },
  ],
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`)
  return value
}

const flag = (name: string) => process.argv.includes(name)

function readLedger(file: string): Set<string> {
  if (!existsSync(file)) return new Set()
  return new Set(JSON.parse(readFileSync(file, 'utf8')) as string[])
}

function writeLedger(file: string, sent: Set<string>): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify([...sent].sort(), null, 2)}\n`)
}

async function findRecipients(payload: Payload, alreadySent: Set<string>) {
  const [managers, events, regions, services] = await Promise.all([
    payload.find({
      collection: 'managers',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      select: { email: true, legacyId: true, name: true, type: true },
    }),
    // Trashed events are left out by the default read; a finished one is not live.
    payload.find({
      collection: 'events',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      select: { manager: true },
      where: { verificationStage: { not_equals: 'finished' } },
    }),
    payload.find({
      collection: 'regions',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      select: { managers: true },
    }),
    payload.find({
      collection: 'clients',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      select: { managers: true },
      where: { enabled: { equals: true } },
    }),
  ])
  const id = (value: unknown) =>
    typeof value === 'number' ? value : (value as { id?: number } | null)?.id

  return selectRecipients({
    managers: managers.docs,
    liveEventManagers: events.docs.map((event) => id(event.manager)),
    regionManagers: regions.docs.map((region) => (region.managers ?? []).map(id)),
    serviceManagers: services.docs.map((service) => (service.managers ?? []).map(id)),
    alreadySent,
  })
}

/**
 * The email for one recipient. The rows it lists are an invitation's own (`summarizeGrants`), so
 * the two cannot list one manager differently.
 *
 * The "what's new" lines are keyed on `recipient.holds` instead, which counts only live events —
 * so a manager with one live class and five finished ones is pitched as a class manager above a
 * list of six. Deliberate: the pitch is about what they still run, the list about what they hold.
 */
async function compose(payload: Payload, recipient: MigrationRecipient, subjectPrefix = '') {
  const brand = getEmailBrand('sahaj-atlas')
  const summary =
    recipient.id === SAMPLE.id
      ? SAMPLE_SUMMARY
      : (
          await summarizeGrants({
            collection: MANAGERS_COLLECTION,
            id: recipient.id,
            payload,
            type: 'manager',
          })
        ).find((part) => part.project === 'sahaj-atlas')
  return {
    from: `${brand.productName} <${MANAGER_EMAIL_FROM}>`,
    subject: `${subjectPrefix}${ATLAS_MIGRATION_SUBJECT}`,
    ...(await renderEmail(
      createElement(AtlasMigrationEmail, {
        brand,
        email: recipient.email,
        highlights: cmsHighlights(recipient.holds),
        mapUrl: MAP_URL,
        name: recipient.name,
        responsibilities: summary?.responsibilities ?? [],
        signInUrl: SIGN_IN_URL,
      }),
    )),
  }
}

async function main(): Promise<void> {
  dotenv.config({ path: ['.env.local', '.env'] })
  const ledgerFile = path.resolve(option('--ledger') ?? DEFAULT_LEDGER)
  const sent = readLedger(ledgerFile)
  const payload = await loadPayloadWithoutSchemaChanges()
  const recipients = await findRecipients(payload, sent)

  const regionManagers = recipients.filter((r) => r.holds.regions > 0).length
  console.log(
    `${recipients.length} recipient(s) not yet sent: ${regionManagers} region manager(s), ` +
      `${recipients.length - regionManagers} other manager(s). ${sent.size} already in ${ledgerFile}.`,
  )
  if (flag('--list')) {
    for (const r of recipients)
      console.log(
        `  managers/${r.id}  ${r.email}  events=${r.holds.events} regions=${r.holds.regions}`,
      )
  }

  const as = option('--as')?.trim().toLowerCase()
  const sample = as
    ? recipients.find((r) => r.email === as)
    : (recipients[0] ?? (console.log('No recipients: showing a sample.'), SAMPLE))
  if (as && !sample) throw new Error(`${as} is not among the recipients.`)

  const htmlFile = option('--html')
  if (htmlFile) {
    writeFileSync(htmlFile, (await compose(payload, sample!)).html)
    console.log(`Rendered ${sample!.email}'s email to ${htmlFile}. Nothing sent.`)
  }

  const transport = (payload.email as { name?: string } | undefined)?.name ?? 'none'

  const previewTo = option('--preview')
  if (previewTo) {
    console.log(`Sending a preview of ${sample!.email}'s email to ${previewTo} via ${transport}…`)
    await payload.sendEmail({ to: previewTo, ...(await compose(payload, sample!, '[Preview] ')) })
    console.log('Preview sent.')
  }

  if (!flag('--send')) return
  if (!flag('--force')) throw new Error('--send needs --force: it emails every recipient above.')
  if (transport !== 'resend') {
    throw new Error(`The email transport is "${transport}", not Resend: refusing to send.`)
  }

  console.warn(`⚠ Sending to ${recipients.length} manager(s) via Resend.`)
  let failed = 0
  for (const recipient of recipients) {
    try {
      await payload.sendEmail({ to: recipient.email, ...(await compose(payload, recipient)) })
      sent.add(recipient.email)
      writeLedger(ledgerFile, sent)
      console.log(`  sent  managers/${recipient.id}`)
    } catch (error) {
      failed += 1
      console.error(`  FAILED managers/${recipient.id}: ${(error as Error).message}`)
    }
    await new Promise((resolve) => setTimeout(resolve, SEND_SPACING_MS))
  }
  console.log(
    `Done: ${recipients.length - failed} sent, ${failed} failed. Re-run to retry failures.`,
  )
}

main().then(
  () => exitAfterFlush(0),
  (error) => {
    console.error(error)
    exitAfterFlush(1)
  },
)
