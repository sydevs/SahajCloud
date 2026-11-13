#!/usr/bin/env node
/**
 * Report every stored Atlas mount whose host `GET /api/atlas/challenge` refuses (#1077).
 *
 * A refused parent gets no captcha, and the widget then shows `error.captcha_blocked` in place of
 * the whole atlas. Each row needs a human decision: give an existing service the right
 * `site.domain`, give the host a service and key of its own, or re-enable the disabled service a
 * row already names as the host's owner.
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
import type { AuditedClient } from './challenge-mounts'
import dotenv from 'dotenv'

import { challengeParentAllowlist } from '../src/endpoints/atlas/challenge/allowlist'
import { originOf } from '../src/lib/utilities/url'
import { normalizeHost } from '../src/plugins/usage/originEnforcement'
import { refusedMounts, storedMounts } from './challenge-mounts'
import { exitAfterFlush, loadPayloadWithoutSchemaChanges } from './lib/payloadBoot'

async function main(): Promise<void> {
  dotenv.config({ path: ['.env.local', '.env'] })
  const payload = await loadPayloadWithoutSchemaChanges()

  const { docs } = await payload.find({
    collection: 'clients',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { label: true, enabled: true, site: { domain: true }, embedMetadata: true },
  })
  const services = docs as AuditedClient[]
  const mounts = storedMounts(services)
  const patterns = await challengeParentAllowlist(payload)
  const refused = refusedMounts(mounts, patterns, services)

  console.log(`Allowlist: ${[...new Set(patterns)].join(', ')}\n`)
  for (const { client, mount, ownedBy, record } of refused) {
    console.log(
      `  ${client.enabled ? '' : '[disabled] '}clients/${client.id} ${JSON.stringify(client.label)}` +
        `  domain=${client.site?.domain || '—'}  ${record.mode}  ${mount}  lastSeen=${record.lastSeen}` +
        (ownedBy
          ? `\n      host owned by disabled clients/${ownedBy.id} ${JSON.stringify(ownedBy.label)} — enable it`
          : ''),
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

main().then(
  () => exitAfterFlush(0),
  (error) => {
    console.error(error)
    exitAfterFlush(1)
  },
)
