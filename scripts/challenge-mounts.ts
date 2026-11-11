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
import { normalizeHost } from '../src/plugins/usage/originEnforcement'

export type AuditedClient = Pick<Client, 'id' | 'label' | 'enabled' | 'site' | 'embedMetadata'>

export interface StoredMount {
  client: AuditedClient
  /** The stored key: the widget document's origin + pathname. */
  mount: string
  record: EmbedMountRecord
}

export interface RefusedMount extends StoredMount {
  /**
   * The disabled service whose own domain covers this host, where one does. Enabling that service
   * is the row's fix, not a domain on the service whose page stored the mount.
   */
  ownedBy?: AuditedClient
}

/**
 * Every stored mount, whatever its mode.
 *
 * ⚠ **An `iframe` mount is judged too.** The widget sends its own document's origin as the
 * challenge's parent, and that is the mount key's origin in a frame as well. A frame on
 * `sahajatlas.com` passes as a built-in host.
 */
export function storedMounts(clients: readonly AuditedClient[]): StoredMount[] {
  return clients.flatMap((client) =>
    Object.entries(client.embedMetadata ?? {}).map(([mount, record]) => ({
      client,
      mount,
      record,
    })),
  )
}

/**
 * The mounts whose origin the challenge refuses.
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
 *
 * ⚠ **That counterfactual stays per row.** Lending every disabled domain to every service would
 * drop a mount the live gate refuses today, which is the one thing this audit exists to find.
 * `ownedBy` carries the owner instead, so such a row names the service to enable.
 */
export function refusedMounts(
  mounts: readonly StoredMount[],
  patterns: readonly string[],
  services: readonly AuditedClient[],
): RefusedMount[] {
  return mounts
    .filter(({ client, mount }) => {
      const allowed = client.enabled ? patterns : [...patterns, ...siteHosts(client.site?.domain)]
      return !isParentAllowed(originOf(mount), allowed)
    })
    .map((row) => {
      const ownedBy = disabledOwner(row.mount, services)
      return ownedBy ? { ...row, ownedBy } : row
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.client.enabled)) - Number(Boolean(a.client.enabled)) ||
        a.mount.localeCompare(b.mount),
    )
}

/**
 * The disabled service holding a refused host as its own domain.
 *
 * No enabled service can hold it: its domain would then be on the allowlist and the mount would
 * have passed.
 */
function disabledOwner(
  mount: string,
  services: readonly AuditedClient[],
): AuditedClient | undefined {
  const host = normalizeHost(originOf(mount))
  if (!host) return undefined
  return services.find(
    (service) => !service.enabled && siteHosts(service.site?.domain).includes(host),
  )
}
