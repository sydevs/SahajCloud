/**
 * The pure half of `audit-challenge-parents.ts` (#1077).
 *
 * Judged with the endpoint's own `isParentAllowed` against its own allowlist, so the audit cannot
 * disagree with the gate it audits.
 */
import type { EmbedMountRecord } from '../src/lib/clients/embedMetadata'
import type { Client } from '../src/payload-types'

import { isParentAllowed } from '../src/endpoints/atlas/challenge/challengeRequest'
import { siteHosts } from '../src/lib/clients/site'
import { originOf } from '../src/lib/utilities/url'

export type AuditedClient = Pick<Client, 'id' | 'name' | 'enabled' | 'site' | 'embedMetadata'>

export interface InlineMount {
  client: AuditedClient
  /** The stored key: the host page's origin + pathname. */
  mount: string
  record: EmbedMountRecord
}

/** Every stored `inline` mount. An `iframe` mount's parent is the widget's own page. */
export function inlineMounts(clients: readonly AuditedClient[]): InlineMount[] {
  return clients.flatMap((client) =>
    Object.entries(client.embedMetadata ?? {})
      .filter(([, record]) => record.mode === 'inline')
      .map(([mount, record]) => ({ client, mount, record })),
  )
}

/**
 * Every stored inline mount whose origin the challenge refuses, from every service.
 *
 * ⚠ **One global allowlist.** A mount on service A's page passes when its host is service B's
 * domain — never test a mount against its own service's domain alone.
 *
 * ⚠ **No date window.** A service with no domain can no longer report (`report.ts` refuses a host
 * outside `siteHosts`), so its rows are frozen at their last report. A window would hide exactly
 * the services this audit exists to find.
 *
 * A disabled service is judged as if re-enabled, with its own domain back on the list, so a row
 * from one names an embed that would still break.
 */
export function refusedMounts(
  clients: readonly AuditedClient[],
  patterns: readonly string[],
): InlineMount[] {
  return inlineMounts(clients)
    .filter(({ client, mount }) => {
      const allowed = client.enabled ? patterns : [...patterns, ...siteHosts(client.site?.domain)]
      return !isParentAllowed(originOf(mount), allowed)
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.client.enabled)) - Number(Boolean(a.client.enabled)) ||
        a.mount.localeCompare(b.mount),
    )
}
