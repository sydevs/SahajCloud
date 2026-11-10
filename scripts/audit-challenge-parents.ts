#!/usr/bin/env node
/**
 * Report every stored inline Atlas mount whose host `GET /api/atlas/challenge` refuses (#1077).
 *
 * A refused parent gets no captcha, and the widget then shows `error.captcha_blocked` in place of
 * the whole atlas. Each row needs a human decision: give an existing service the right
 * `site.domain`, or give the host a service and key of its own.
 *
 * **Read-only, always.** There is no `--force`.
 *
 * Usage:
 *   pnpm tsx scripts/audit-challenge-parents.ts
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET, and SAHAJATLAS_URL / WEMEDITATE_WEB_URL — the
 * first-party frontends the endpoint builds in. Against production, run it under
 * `railway run --service SahajCloud` with the public `DATABASE_URL`.
 */
import type { AuditedClient } from './challenge-parents'
import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { getPayload } from 'payload'

import { challengeAllowlist, refusedMounts } from './challenge-parents'

async function loadPayload(): Promise<Payload> {
  dotenv.config({ path: ['.env.local', '.env'] })
  const { default: configPromise } = await import('../src/payload.config')
  return getPayload({ config: await configPromise })
}

async function main(): Promise<void> {
  const firstParty = [process.env.SAHAJATLAS_URL, process.env.WEMEDITATE_WEB_URL]
  if (firstParty.some((url) => !url)) {
    console.error('SAHAJATLAS_URL and WEMEDITATE_WEB_URL must both be set.')
    process.exit(1)
  }

  const payload = await loadPayload()
  const { docs } = await payload.find({
    collection: 'clients',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { name: true, enabled: true, site: { domain: true }, embedMetadata: true },
  })
  const clients = docs as AuditedClient[]

  const patterns = challengeAllowlist(firstParty as string[], clients)
  const refused = refusedMounts(clients, patterns)
  const inline = clients.reduce(
    (n, c) => n + Object.values(c.embedMetadata ?? {}).filter((r) => r.mode === 'inline').length,
    0,
  )

  console.log(`Allowlist: ${patterns.join(', ')}\n`)
  if (refused.length === 0) {
    console.log(`All ${inline} stored inline mount(s) pass the challenge. Nothing to fix.`)
    process.exit(0)
  }

  for (const row of refused) {
    console.log(
      `  ${row.enabled ? '' : '[disabled] '}clients/${row.clientId} ${JSON.stringify(row.client)}` +
        `  domain=${row.domain ?? '—'}  ${row.mount}  lastSeen=${row.lastSeen}`,
    )
  }
  const live = refused.filter((row) => row.enabled)
  const hosts = new Set(live.map((row) => row.origin))
  console.log(
    `\n${live.length} refused inline mount(s) on ${hosts.size} host(s) from enabled services,` +
      ` ${refused.length - live.length} from disabled ones, of ${inline} stored.`,
  )
  process.exit(0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
