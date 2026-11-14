#!/usr/bin/env node
/**
 * Send the two one-off Atlas cutover emails, once the final sync has landed in production:
 *
 * - `--email welcome` (the default): "Welcome to the new Sahaj Atlas", to every active Atlas
 *   manager (`selectRecipients`).
 * - `--email install`: "Upgrade <domain> to Sahaj Atlas v3", to each manager of a service whose
 *   site still runs the legacy widget (`selectInstallRecipients`), with a button that signs them in
 *   on that service's Install tab for a week.
 *
 * Both pure halves are in `./atlas-migration-recipients.ts`.
 *
 * shortcut: a one-off for the Atlas cutover, delete it, its templates, its pure half and
 * `public/emails/atlas-migration-banner.jpg` once sent.
 *
 * Usage (nothing is sent without `--preview` or `--send --force`):
 *   pnpm tsx scripts/send-atlas-migration-email.ts                    # counts only
 *   pnpm tsx scripts/send-atlas-migration-email.ts --list             # and every recipient
 *   pnpm tsx scripts/send-atlas-migration-email.ts --html <file>      # render one, send nothing
 *   pnpm tsx scripts/send-atlas-migration-email.ts --preview <addr>   # send one to <addr>
 *   pnpm tsx scripts/send-atlas-migration-email.ts --send --force     # send to everyone
 *
 * `--as <email>` picks whose details a rendered or previewed email shows (default: the first
 * recipient, or a sample when there is none). ⚠ A rendered or previewed install email carries no
 * sign-in token — its button opens the Install tab behind the ordinary sign-in — because a preview
 * goes to someone other than the manager it shows. `--ledger <file>` records each email sent, so a
 * re-run after a failure sends only the rest (default `seeds/atlas/local/<kind>-email-ledger.json`,
 * gitignored because it holds addresses).
 *
 * Against production, so the read is production's, the links are production's and the send goes
 * through Resend:
 *   railway run --service SahajCloud -- env DATABASE_URL=<Postgres DATABASE_PUBLIC_URL> \
 *     pnpm tsx scripts/send-atlas-migration-email.ts --preview you@example.com
 *
 * The boot changes no schema (`./lib/payloadBoot.ts`) and the script writes nothing to the
 * database: the ledger is the only record of who was sent.
 */
import type {
  CandidateService,
  InstallRecipient,
  MigrationRecipient,
} from './atlas-migration-recipients'
import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { createElement } from 'react'

import { ADOPTED_CLIENT_LEGACY_IDS } from '../seeds/atlas/sync/merges'
import { managersLogin } from '../src/collections/Managers/login'
import { AtlasInstallEmail, atlasInstallSubject } from '../src/emails/AtlasInstallEmail'
import {
  ATLAS_MIGRATION_SUBJECT,
  AtlasMigrationEmail,
  cmsHighlights,
} from '../src/emails/AtlasMigrationEmail'
import { adminDocPath } from '../src/lib/utilities/adminUrl'
import { getServerUrl } from '../src/lib/utilities/serverUrl'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '../src/plugins/email'
import { pageLinkUrl } from '../src/plugins/login'
import { MANAGERS_COLLECTION, summarizeGrants } from '../src/plugins/login/grantSummary'
import { selectInstallRecipients, selectRecipients } from './atlas-migration-recipients'
import { exitAfterFlush, loadPayloadWithoutSchemaChanges } from './lib/payloadBoot'

const MAP_URL = 'https://sahajatlas.com'
/** Resend's default limit is 2 requests a second. */
const SEND_SPACING_MS = 600
/** How long the install email's button signs its manager in. */
const INSTALL_LINK_DAYS = 7

const SAMPLE: MigrationRecipient = {
  id: 0,
  email: 'manager@example.com',
  name: 'Sample Manager',
  holds: { events: 2, regions: 1, services: 1 },
}

const SAMPLE_INSTALL: InstallRecipient = {
  managerId: 0,
  email: 'manager@example.com',
  name: 'Sample Manager',
  service: { id: 0, label: 'Sample Service', domain: 'www.example.org' },
  key: 'manager@example.com clients/0',
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

interface Message {
  from: string
  subject: string
  html: string
  text: string
}

/** One email kind: who gets it, and what each one says. */
interface Campaign<R> {
  recipients: R[]
  sample: R
  summary: string
  /** The ledger's key, and the address it goes to. */
  key: (recipient: R) => string
  to: (recipient: R) => string
  describe: (recipient: R) => string
  /** `preview` carries no credential: the message goes to someone other than `recipient`. */
  compose: (recipient: R, opts: { preview: boolean }) => Promise<Message>
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

const idOf = (value: unknown) =>
  typeof value === 'number' ? value : (value as { id?: number } | null)?.id

async function findManagers(payload: Payload) {
  return (
    await payload.find({
      collection: 'managers',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      select: { email: true, legacyId: true, name: true, type: true },
    })
  ).docs
}

async function welcomeCampaign(
  payload: Payload,
  alreadySent: Set<string>,
): Promise<Campaign<MigrationRecipient>> {
  const [managers, events, regions, services] = await Promise.all([
    findManagers(payload),
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
  const recipients = selectRecipients({
    managers,
    liveEventManagers: events.docs.map((event) => idOf(event.manager)),
    regionManagers: regions.docs.map((region) => (region.managers ?? []).map(idOf)),
    serviceManagers: services.docs.map((service) => (service.managers ?? []).map(idOf)),
    alreadySent,
  })
  const regionManagers = recipients.filter((r) => r.holds.regions > 0).length
  const origin = getServerUrl()

  return {
    recipients,
    sample: SAMPLE,
    summary:
      `${recipients.length} recipient(s) not yet sent: ${regionManagers} region manager(s), ` +
      `${recipients.length - regionManagers} other manager(s).`,
    key: (r) => r.email,
    to: (r) => r.email,
    describe: (r) =>
      `managers/${r.id}  ${r.email}  events=${r.holds.events} regions=${r.holds.regions}`,
    /**
     * The rows it lists are an invitation's own (`summarizeGrants`), so the two cannot list one
     * manager differently. The "what's new" lines are keyed on `recipient.holds` instead, which
     * counts only live events — so a manager with one live class and five finished ones is
     * pitched as a class manager above a list of six. Deliberate: the pitch is about what they
     * still run, the list about what they hold.
     */
    compose: async (recipient) => {
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
        subject: ATLAS_MIGRATION_SUBJECT,
        ...(await renderEmail(
          createElement(AtlasMigrationEmail, {
            bannerUrl: `${origin}/emails/atlas-migration-banner.jpg`,
            brand,
            email: recipient.email,
            highlights: cmsHighlights(recipient.holds),
            mapUrl: MAP_URL,
            name: recipient.name,
            responsibilities: summary?.responsibilities ?? [],
            signInUrl: `${origin}/admin/login`,
          }),
        )),
      }
    },
  }
}

async function installCampaign(
  payload: Payload,
  alreadySent: Set<string>,
): Promise<Campaign<InstallRecipient>> {
  const [managers, services] = await Promise.all([
    findManagers(payload),
    payload.find({
      collection: 'clients',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      select: {
        enabled: true,
        label: true,
        legacyId: true,
        managers: true,
        roles: true,
        site: { domain: true, track: true },
      },
    }),
  ])
  const recipients = selectInstallRecipients({
    managers,
    services: services.docs as CandidateService[],
    adopted: ADOPTED_CLIENT_LEGACY_IDS,
    alreadySent,
  })
  const origin = getServerUrl()
  const serviceCount = new Set(recipients.map((r) => r.service.id)).size

  return {
    recipients,
    sample: SAMPLE_INSTALL,
    summary: `${recipients.length} email(s) not yet sent, to the managers of ${serviceCount} service(s).`,
    key: (r) => r.key,
    to: (r) => r.email,
    describe: (r) =>
      `clients/${r.service.id} ${r.service.domain}  managers/${r.managerId}  ${r.email}`,
    compose: async (recipient, { preview }) => {
      const brand = getEmailBrand('sahaj-atlas')
      const to = adminDocPath('clients', recipient.service.id, 'install')
      const installTabUrl = `${origin}${to}`
      const installUrl = preview
        ? installTabUrl
        : await pageLinkUrl(
            managersLogin,
            recipient.managerId,
            {
              label: `Install on ${recipient.service.domain}`,
              to,
              ttlMs: INSTALL_LINK_DAYS * 24 * 60 * 60 * 1000,
            },
            payload.secret,
          )
      return {
        from: `${brand.productName} <${MANAGER_EMAIL_FROM}>`,
        subject: atlasInstallSubject(recipient.service.domain),
        ...(await renderEmail(
          createElement(AtlasInstallEmail, {
            brand,
            domain: recipient.service.domain,
            email: recipient.email,
            installTabUrl,
            installUrl,
            mapUrl: MAP_URL,
            name: recipient.name,
            signInUrl: `${origin}/admin/login`,
            validFor: `${INSTALL_LINK_DAYS} days`,
          }),
        )),
      }
    },
  }
}

async function run<R>(
  payload: Payload,
  campaign: Campaign<R>,
  ledgerFile: string,
  sent: Set<string>,
) {
  const { recipients } = campaign
  console.log(`${campaign.summary} ${sent.size} already in ${ledgerFile}.`)
  if (flag('--list')) for (const r of recipients) console.log(`  ${campaign.describe(r)}`)

  const as = option('--as')?.trim().toLowerCase()
  const sample = as
    ? recipients.find((r) => campaign.to(r) === as)
    : (recipients[0] ?? (console.log('No recipients: showing a sample.'), campaign.sample))
  if (as && !sample) throw new Error(`${as} is not among the recipients.`)

  const htmlFile = option('--html')
  if (htmlFile) {
    writeFileSync(htmlFile, (await campaign.compose(sample!, { preview: true })).html)
    console.log(`Rendered ${campaign.to(sample!)}'s email to ${htmlFile}. Nothing sent.`)
  }

  const transport = (payload.email as { name?: string } | undefined)?.name ?? 'none'

  const previewTo = option('--preview')
  if (previewTo) {
    console.log(
      `Sending a preview of ${campaign.to(sample!)}'s email to ${previewTo} via ${transport}…`,
    )
    const message = await campaign.compose(sample!, { preview: true })
    await payload.sendEmail({ to: previewTo, ...message, subject: `[Preview] ${message.subject}` })
    console.log('Preview sent.')
  }

  if (!flag('--send')) return
  if (!flag('--force')) throw new Error('--send needs --force: it emails every recipient above.')
  if (transport !== 'resend') {
    throw new Error(`The email transport is "${transport}", not Resend: refusing to send.`)
  }

  console.warn(`⚠ Sending ${recipients.length} email(s) via Resend.`)
  let failed = 0
  for (const recipient of recipients) {
    try {
      const message = await campaign.compose(recipient, { preview: false })
      await payload.sendEmail({ to: campaign.to(recipient), ...message })
      sent.add(campaign.key(recipient))
      writeLedger(ledgerFile, sent)
      console.log(`  sent  ${campaign.describe(recipient)}`)
    } catch (error) {
      failed += 1
      console.error(`  FAILED ${campaign.describe(recipient)}: ${(error as Error).message}`)
    }
    await new Promise((resolve) => setTimeout(resolve, SEND_SPACING_MS))
  }
  console.log(
    `Done: ${recipients.length - failed} sent, ${failed} failed. Re-run to retry failures.`,
  )
}

async function main(): Promise<void> {
  dotenv.config({ path: ['.env.local', '.env'] })
  const kind = option('--email') ?? 'welcome'
  if (kind !== 'welcome' && kind !== 'install') {
    throw new Error(`--email is "welcome" or "install", not "${kind}".`)
  }
  const ledgerFile = path.resolve(
    option('--ledger') ??
      (kind === 'welcome'
        ? 'seeds/atlas/local/migration-email-ledger.json'
        : 'seeds/atlas/local/install-email-ledger.json'),
  )
  const sent = readLedger(ledgerFile)
  const payload = await loadPayloadWithoutSchemaChanges()

  if (kind === 'welcome') await run(payload, await welcomeCampaign(payload, sent), ledgerFile, sent)
  else await run(payload, await installCampaign(payload, sent), ledgerFile, sent)
}

main().then(
  () => exitAfterFlush(0),
  (error) => {
    console.error(error)
    exitAfterFlush(1)
  },
)
