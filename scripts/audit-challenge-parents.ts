#!/usr/bin/env node
/**
 * Report every stored Atlas mount whose host `GET /api/atlas/challenge` refuses (#1077).
 *
 * A refused parent gets no captcha, and the widget then shows `error.captcha_blocked` in place of
 * the whole atlas. Each row needs a human decision: give an existing service the right
 * `site.domain`, or give the host a service and key of its own.
 *
 * **Read-only, always.** There is no `--force`, and the boot runs no schema push, no pending
 * migration and no `onInit`, whatever `NODE_ENV` says.
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

import { challengeParentAllowlist } from '../src/endpoints/atlas/challenge/allowlist'
import { originOf } from '../src/lib/utilities/url'
import { normalizeHost } from '../src/plugins/usage/originEnforcement'
import { refusedMounts, storedMounts } from './challenge-parents'

async function loadPayload(): Promise<Payload> {
  const { default: configPromise } = await import('../src/payload.config')
  const payload = await getPayload({
    config: await configPromise,
    disableDBConnect: true,
    disableOnInit: true,
  })
  // `connect` pushes the dev schema, or applies `prodMigrations` under NODE_ENV=production.
  const db = payload.db as typeof payload.db & { push?: boolean; prodMigrations?: unknown }
  db.push = false
  db.prodMigrations = undefined
  await db.connect?.()
  return payload
}

async function main(): Promise<void> {
  dotenv.config({ path: ['.env.local', '.env'] })
  const payload = await loadPayload()

  const { docs } = await payload.find({
    collection: 'clients',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { name: true, enabled: true, site: { domain: true }, embedMetadata: true },
  })
  const mounts = storedMounts(docs as AuditedClient[])
  const patterns = await challengeParentAllowlist(payload)
  const refused = refusedMounts(mounts, patterns)

  console.log(`Allowlist: ${[...new Set(patterns)].join(', ')}\n`)
  for (const { client, mount, record } of refused) {
    console.log(
      `  ${client.enabled ? '' : '[disabled] '}clients/${client.id} ${JSON.stringify(client.name)}` +
        `  domain=${client.site?.domain || '—'}  ${record.mode}  ${mount}  lastSeen=${record.lastSeen}`,
    )
  }
  if (refused.length === 0) {
    console.log(`All ${mounts.length} stored mount(s) pass the challenge. Nothing to fix.`)
  } else {
    const live = refused.filter(({ client }) => client.enabled)
    const hosts = new Set(live.map(({ mount }) => normalizeHost(originOf(mount))))
    console.log(
      `\n${live.length} refused mount(s) on ${hosts.size} host(s) from enabled services,` +
        ` ${refused.length - live.length} from disabled ones, of ${mounts.length} stored.`,
    )
  }
}

/**
 * Exit once stdout has flushed. On a pipe it flushes asynchronously, so an immediate exit can cut
 * the report, and without an exit the Payload boot's open handles keep the process alive.
 */
const exitAfterFlush = (code: number) => process.stdout.write('', () => process.exit(code))

main().then(
  () => exitAfterFlush(0),
  (error) => {
    console.error(error)
    exitAfterFlush(1)
  },
)
