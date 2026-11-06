/**
 * Where a service's atlas lives: one domain, and one primary page on it.
 *
 * `site.domain` is the whole of a key's origin allowlist, and `site.domain` +
 * `site.page` is the page the service verifies, routes from, and — when it owns
 * its region — publishes canonical URLs on. Shared by the `Clients` schema, the
 * Install tab, the origin check, and the verification and claim paths, so none
 * of them can disagree about which page is meant.
 *
 * Deep import, not the `@/plugins/usage` barrel: the Install tab is a client
 * component, and the barrel pulls the pg pool into the browser (`src/AGENTS.md`).
 */
import type {
  EmbedMetadata,
  EmbedMountObservation,
  EmbedMountRecord,
} from '@/lib/clients/embedMetadata'
import { splitMountKey } from '@/lib/clients/verification'
import { normalizeHost } from '@/plugins/usage/originEnforcement'

/** The kinds of site the Install tab has a track for, as `site.track` stores them. */
export const SITE_TRACKS = [
  'custom',
  'wp-selfhosted',
  'wp-com',
  'wix',
  'squarespace',
  'iframe',
] as const

export type SiteTrack = (typeof SITE_TRACKS)[number]

/** How tall a pasted embed is, as `site.embedHeight` stores it. */
export const EMBED_HEIGHTS = ['fixed', 'screen', 'window'] as const

export type EmbedHeight = (typeof EMBED_HEIGHTS)[number]

/** What a service's `site` group holds, as far as these helpers read it. */
export interface SiteFields {
  domain?: string | null
  page?: string | null
}

/**
 * The hosts a service's key is accepted from: its domain, and the same domain
 * with or without `www.`.
 *
 * ⚠ **One domain, exactly, plus its twin.** A site served at both
 * `sahajayoga.ca` and `www.sahajayoga.ca` is one site, and the browser sends
 * whichever the visitor typed; any other host is another site, which needs a
 * service of its own. Empty when no domain is set, which the origin check reads
 * as "no browser origin to enforce" — an app's key, whose requests carry none.
 */
export function siteHosts(domain: string | null | undefined): string[] {
  const host = normalizeHost(domain)
  if (!host || host.startsWith('*.')) return []
  const twin = host.startsWith('www.') ? host.slice(4) : `www.${host}`
  return twin.includes('.') ? [host, twin] : [host]
}

/**
 * Whether a service has a domain at all, whether or not it names a usable host.
 *
 * ⚠ **Not the same question as `siteHosts` being empty, and the origin gate owes
 * both.** `siteHosts` answers `[]` for a service with no domain *and* for one
 * whose domain is no bare host — a wildcard, or a value raw SQL wrote past
 * `siteDomainValidate`. Reading those two alike turns the gate off for the
 * second: a key restricted to `*.sahajayoga.ca` would be accepted from every
 * origin. No domain is an app's key, whose requests carry no browser origin. A
 * domain we refuse is a misconfigured site, and gets no origin.
 */
export function hasSiteDomain(domain: string | null | undefined): boolean {
  return Boolean(domain?.trim())
}

/**
 * The primary page as a URL, or `null` until both halves are set.
 *
 * Always `https` on the bare domain, which is the shape every canonical URL
 * takes (`canonicalUrl.ts`). A page that is only reachable over plain http is
 * not one the CMS will verify, and so not one it will publish.
 */
export function primaryPageUrl(site: SiteFields | null | undefined): string | null {
  const host = normalizeHost(site?.domain)
  const page = site?.page
  if (!host || host.startsWith('*.') || !page || !page.startsWith('/')) return null
  return `https://${host}${page}`
}

/** A mount path, compared the way two spellings of one page should be. */
export function normalizeMountPath(mount: string): string {
  const [path, query] = mount.split('?')
  const trimmed = `/${path.split('/').filter(Boolean).join('/')}`
  return query ? `${trimmed}?${query}` : trimmed
}

/**
 * The widget's most recent report from the primary page, on either of the
 * site's hosts, or `null` when it has not reported from there.
 */
export function primaryReport(
  embedMetadata: EmbedMetadata | null | undefined,
  site: SiteFields | null | undefined,
): { key: string; record: EmbedMountRecord } | null {
  const hosts = siteHosts(site?.domain)
  if (!embedMetadata || typeof embedMetadata !== 'object' || !site?.page || hosts.length === 0) {
    return null
  }
  const wanted = normalizeMountPath(site.page)
  let best: { key: string; record: EmbedMountRecord } | null = null
  for (const [key, record] of Object.entries(embedMetadata)) {
    const split = splitMountKey(key)
    if (!split || !hosts.includes(normalizeHost(split.domain) ?? '')) continue
    if (normalizeMountPath(split.mount) !== wanted) continue
    if (!best || (record.lastSeen ?? '') > (best.record.lastSeen ?? '')) best = { key, record }
  }
  return best
}

/**
 * Whether a page can give each class a link of its own: the widget runs in the
 * page itself, not a frame, and can write the page's address.
 *
 * ⚠ **The only test of whether a site may own its region's links**, so it reads
 * what the widget observed rather than which kind of site the volunteer chose. A
 * query-string address counts — a `?atlas=` link is one a visitor can share and
 * land on.
 */
export function supportsClassAddresses(record: EmbedMountObservation): boolean {
  return record.mode === 'inline' && record.urlWritable
}
