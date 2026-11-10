/**
 * The pure half of `audit-challenge-parents.ts` (#1077): which stored inline mounts the captcha
 * challenge would refuse today.
 *
 * Built from the endpoint's own `allowedParentHosts` and `isParentAllowed`, so the audit cannot
 * disagree with the gate it audits.
 */
import type { EmbedMetadata } from '../src/lib/clients/embedMetadata'

import {
  allowedParentHosts,
  isParentAllowed,
} from '../src/endpoints/atlas/challenge/challengeRequest'
import { originOf } from '../src/lib/utilities/url'

export interface AuditedClient {
  id: number
  name?: string | null
  enabled?: boolean | null
  site?: { domain?: string | null } | null
  embedMetadata?: EmbedMetadata | null
}

export interface RefusedMount {
  clientId: number
  client: string
  enabled: boolean
  domain: string | null
  /** The parent origin the widget would send from this mount, or the raw key if it has none. */
  origin: string
  mount: string
  lastSeen: string
}

/** The allowlist exactly as `GET /api/atlas/challenge` builds it: active services only. */
export function challengeAllowlist(
  firstPartyUrls: readonly string[],
  clients: readonly AuditedClient[],
): string[] {
  return allowedParentHosts(
    firstPartyUrls,
    clients.filter((client) => client.enabled).map((client) => client.site?.domain ?? null),
  )
}

/**
 * Every stored `inline` mount whose origin the challenge refuses, from every service.
 *
 * ⚠ **One global allowlist.** A mount on service A's page passes when its host is service B's
 * domain, as the endpoint judges it — never test a mount against its own service's domain alone.
 *
 * ⚠ **No date window.** A service with no domain can no longer report (`report.ts` refuses a host
 * outside `siteHosts`), so its rows are frozen at their last report. A window would hide exactly
 * the services this audit exists to find.
 *
 * Disabled services are judged too and flagged, so an embed that would break on re-enabling one
 * is visible. An `iframe` mount is skipped: its parent is the widget's own page.
 */
export function refusedMounts(
  clients: readonly AuditedClient[],
  patterns: readonly string[],
): RefusedMount[] {
  const rows: RefusedMount[] = []
  for (const client of clients) {
    for (const [mount, record] of Object.entries(client.embedMetadata ?? {})) {
      if (record.mode !== 'inline') continue
      const origin = originOf(mount)
      if (isParentAllowed(origin, patterns)) continue
      rows.push({
        clientId: client.id,
        client: client.name ?? `clients/${client.id}`,
        enabled: Boolean(client.enabled),
        domain: client.site?.domain?.trim() || null,
        origin: origin ?? mount,
        mount,
        lastSeen: record.lastSeen,
      })
    }
  }
  return rows.sort(
    (a, b) =>
      Number(b.enabled) - Number(a.enabled) ||
      a.origin.localeCompare(b.origin) ||
      b.lastSeen.localeCompare(a.lastSeen),
  )
}
