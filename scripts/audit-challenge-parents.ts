#!/usr/bin/env node
/**
 * Report every stored inline Atlas mount whose host `GET /api/atlas/challenge` refuses (#1077).
 *
 * A refused parent gets no captcha, and the widget then shows `error.captcha_blocked` in place of
 * the whole atlas. Each row needs a human decision: give an existing service the right
 * `site.domain`, or give the host a service and key of its own.
 *
 * **Read-only, always.** There is no `--force`, and `onInit` is skipped, so the boot cancels no
 * stale jobs either.
 *
 * ⚠ **Run it from a checkout production already runs.** Booting the config against a database
 * with `NODE_ENV=production` applies the checkout's pending migrations (`prodMigrations`).
 *
 * Usage:
 *   pnpm tsx scripts/audit-challenge-parents.ts
 *
 * Against production: `railway run --service SahajCloud -- env DATABASE_URL=<Postgres
 * DATABASE_PUBLIC_URL> pnpm tsx scripts/audit-challenge-parents.ts`.
 */
import type { AuditedClient } from './challenge-parents'
import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { getPayload } from 'payload'

import { inlineMounts, refusedMounts } from './challenge-parents'

async function loadPayload(): Promise<Payload> {
  const { default: configPromise } = await import('../src/payload.config')
  return getPayload({ config: await configPromise, disableOnInit: true })
}

async function main(): Promise<void> {
  dotenv.config({ path: ['.env.local', '.env'] })
  const payload = await loadPayload()
  // Imported after dotenv: it reads `serverEnv`, which parses the environment on import.
  const { challengeParentAllowlist } = await import('../src/endpoints/atlas/challenge/allowlist')

  const { docs } = await payload.find({
    collection: 'clients',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { name: true, enabled: true, site: { domain: true }, embedMetadata: true },
  })
  const clients = docs as AuditedClient[]
  const patterns = await challengeParentAllowlist(payload)
  const refused = refusedMounts(clients, patterns)
  const judged = inlineMounts(clients).length

  console.log(`Allowlist: ${[...new Set(patterns)].join(', ')}\n`)
  if (refused.length === 0) {
    console.log(`All ${judged} stored inline mount(s) pass the challenge. Nothing to fix.`)
    process.exit(0)
  }

  for (const { client, mount, record } of refused) {
    console.log(
      `  ${client.enabled ? '' : '[disabled] '}clients/${client.id} ${JSON.stringify(client.name)}` +
        `  domain=${client.site?.domain || '—'}  ${mount}  lastSeen=${record.lastSeen}`,
    )
  }
  const live = refused.filter(({ client }) => client.enabled)
  const hosts = new Set(live.map(({ mount }) => URL.parse(mount)?.host ?? mount))
  console.log(
    `\n${live.length} refused inline mount(s) on ${hosts.size} host(s) from enabled services,` +
      ` ${refused.length - live.length} from disabled ones, of ${judged} stored.`,
  )
  process.exit(0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
