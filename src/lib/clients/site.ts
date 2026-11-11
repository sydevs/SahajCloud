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
import { isValidCanonicalDomain } from '@/lib/clients/canonical'
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

/**
 * Whether a track can give a class a search listing of its own: not an iframe,
 * and not Squarespace, whose own canonical tag sends every class address back
 * to the page. The search checks run only where it can, since elsewhere they
 * could only fail. The Install tab's `TrackMeta.searchListings` agrees.
 */
export function hasSearchListings(track: SiteTrack | null | undefined): boolean {
  return track !== 'squarespace' && track !== 'iframe'
}

/**
 * How tall a pasted `<sahaj-atlas>` is, as `site.embedHeight` stores it: a
 * definite height, or none at all.
 *
 * Those are the embed contract's only two shapes (sydevs/SahajAtlasWeb
 * `docs/embedding.md`, "Sizing the element"): with a height the map lives in the
 * page between header and footer, and with none it fills the browser window. A
 * free number is not offered because below 420px the widget gives up on the map
 * and shows its compact card.
 */
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

/**
 * What a service is called to the public — a registrant email's sender name:
 * its own `title`, else its site's domain. `null` when it has neither; the
 * internal `label` is never a fallback.
 */
export function clientPublicTitle(client: {
  title?: string | null
  site?: SiteFields | null
}): string | null {
  return client.title?.trim() || client.site?.domain?.trim() || null
}

/** A mount path, compared the way two spellings of one page should be. */
export function normalizeMountPath(mount: string): string {
  const [path, query] = mount.split('?')
  const trimmed = `/${path.split('/').filter(Boolean).join('/')}`
  return query ? `${trimmed}?${query}` : trimmed
}

/**
 * Whether `host` + `mount` is the site's page: on its domain or www twin, with
 * the path however its trailing slash is spelled. The one comparison for "is
 * this still the service's page", read by region ownership, the SEO checks and
 * the Install tab.
 */
export function isPrimaryPage(
  site: SiteFields | null | undefined,
  host: string | null | undefined,
  mount: string | null | undefined,
): boolean {
  if (!site?.page || mount == null) return false
  return (
    siteHosts(site.domain).includes(normalizeHost(host) ?? '') &&
    normalizeMountPath(mount) === normalizeMountPath(site.page)
  )
}

/** The fields region ownership reads off a `clients` row. */
export interface OwnershipFields {
  enabled?: boolean | null
  site?: SiteFields | null
  canonical?: {
    owned?: boolean | null
    verification?: { verified?: { domain?: string | null; mount?: string | null } | null } | null
  } | null
}

/**
 * The verified host a row can publish its region's links on: a bare host, still
 * the service's current page. `regionOwners.ts` applies it to the rows its
 * query already narrowed to active owners.
 */
export function verifiedHomeHost(row: OwnershipFields): string | null {
  const verified = row.canonical?.verification?.verified
  if (!isValidCanonicalDomain(verified?.domain)) return null
  return isPrimaryPage(row.site, verified.domain, verified.mount ?? '/') ? verified.domain : null
}

/**
 * The host a row in hand is the home for its region's links on, or `null` —
 * the read rule `regionOwners.ts` queries by, for a reader already holding the
 * row: active, `canonical.owned`, and {@link verifiedHomeHost}. Registrant
 * emails link to the site only while it holds; the Install tab says so only
 * while it holds.
 */
export function ownedHost(row: OwnershipFields): string | null {
  return row.enabled === true && row.canonical?.owned === true ? verifiedHomeHost(row) : null
}

/** A report from the page being installed, as {@link reportedMountsFor} finds it. */
export interface ReportedMount {
  /** The `origin + pathname` key `embedMetadata` is keyed by. */
  key: string
  host: string
  mount: string
  lastSeen?: string
  record: EmbedMountRecord
}

/**
 * The widget's reports from one page, newest first — the live host wins over a
 * staging copy reported last month.
 *
 * Matched on the path, and on the domain or its www twin when one is set (the
 * browser reports whichever the visitor typed). A WordPress permalink mount
 * (`/?p=42`) is compared with its query intact, because that query *is* the
 * page there.
 */
export function reportedMountsFor(
  embedMetadata: EmbedMetadata | null | undefined,
  site: SiteFields | null | undefined,
): ReportedMount[] {
  if (!embedMetadata || typeof embedMetadata !== 'object' || !site?.page) return []

  const wanted = normalizeMountPath(site.page)
  const hosts = siteHosts(site.domain)
  const mounts: ReportedMount[] = []
  for (const [key, record] of Object.entries(embedMetadata)) {
    const split = splitMountKey(key)
    if (!split || normalizeMountPath(split.mount) !== wanted) continue
    if (hosts.length > 0 && !hosts.includes(normalizeHost(split.domain) ?? '')) continue
    mounts.push({ key, host: split.domain, mount: split.mount, lastSeen: record.lastSeen, record })
  }
  return mounts.sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''))
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
