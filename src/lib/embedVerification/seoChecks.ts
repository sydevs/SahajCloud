import type { AtlasSeoDocument } from '@/endpoints/atlas/seo/seoDocument'
import type { AtlasSitemapUrl } from '@/endpoints/responseTypes'
import { canonicalMountUrl, canonicalTargetForHost } from '@/lib/atlas/canonicalUrl'
import type { RoutingMode } from '@/lib/clients/canonical'
import type { SeoCheckId, SeoCheckResult, VerifiedEmbed } from '@/lib/clients/verification'

import { decodeEntities } from './readinessMarker'

/**
 * Whether a verified embed is actually publishing the metadata we gave it
 * (#1055): what a **crawler** sees — raw HTML, no JavaScript — carries the
 * `<title>`, canonical, JSON-LD and crawlable body the SEO endpoint answered.
 * `verifyEmbed` asks the opposite question, and a page can pass one and fail
 * the other; this failure looks perfect to the volunteer and is unindexable.
 *
 * **Plain HTTP, deliberately.** A headless render shows the page *after* the
 * widget replaced its children, the state no crawler is in.
 *
 * ⚠ **Every result is a warning, never a failure.** Nothing here reaches
 * `failureCount`; `nextSeoCheckState` says why.
 *
 * ⚠ **The resolvers are injected rather than imported**, which is also what
 * lets `tests/unit/seo-checks.spec.ts` drive every check with no database.
 */

const FETCH_TIMEOUT_MS = 8000

/** Sitemap documents one check will read, index entries included. */
const MAX_SITEMAP_DOCUMENTS = 6

/** In the tab's order. One list, so every branch covers the same set. */
const PAGE_CHECKS = ['title', 'canonical', 'json-ld', 'body'] as const

/** `<loc>` entries one sitemap index may contribute. */
const MAX_INDEX_ENTRIES = 20

export interface FetchedPage {
  ok: boolean
  status: number
  body: string
  detail?: string
}

interface FetchPageOptions {
  /**
   * Refuse a redirect that leaves this host, instead of following it.
   *
   * ⚠ **Judged before each hop, never on the answer.** A followed redirect has
   * already issued the request — a `Sitemap:` line that 302s to an internal
   * address is the hole {@link isOnHost} closes, one hop further out.
   */
  sameHost: string
}

export type FetchPage = (url: string, options: FetchPageOptions) => Promise<FetchedPage>

const MAX_SAME_HOST_REDIRECTS = 4

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * Most bytes of one document we will read.
 *
 * ⚠ **A cap, because the other end is not ours.** Every value compared is near
 * the top of the page, and unbounded a hostile host can stream whatever it
 * manages inside the timeout into this process's heap.
 */
const MAX_BODY_BYTES = 1_024 * 1_024

/**
 * Fetch one document as a crawler would, and **never throw**: the caller has to
 * tell "their page is wrong" from "we could not look", as with `browserRendering`.
 */
export const fetchPage: FetchPage = async (url, { sameHost }) => {
  try {
    // `manual` is the only mode that can refuse a hop before it is taken.
    let current = url
    for (let hop = 0; ; hop++) {
      const response = await fetch(current, {
        redirect: 'manual',
        headers: {
          // Named, so a site can tell what hit it and allowlist us.
          'User-Agent': 'SahajCloud-SEO-Check (+https://github.com/sydevs/SahajCloud)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      const location = REDIRECT_STATUSES.has(response.status)
        ? response.headers.get('location')
        : null
      if (!location) {
        return {
          ok: response.ok,
          status: response.status,
          body: response.ok ? await readCapped(response) : '',
        }
      }

      const next = URL.parse(location, current)
      if (!next || !isOnHost(next.href, sameHost)) {
        return { ok: false, status: response.status, body: '', detail: OFF_HOST }
      }
      if (hop >= MAX_SAME_HOST_REDIRECTS) {
        return { ok: false, status: response.status, body: '', detail: TOO_MANY_HOPS }
      }
      current = next.href
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: '',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Why a bounded fetch gave up. */
export const OFF_HOST = 'The redirect left the host under check, so it was not followed.'
const TOO_MANY_HOPS = 'Too many redirects on this host.'

/** The first {@link MAX_BODY_BYTES} of a response, decoded as UTF-8. */
async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return ''

  const reader = response.body?.getReader()
  if (!reader) return ''

  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      chunks.push(value)
      size += value.byteLength
      // Truncate rather than refuse: the `<head>` is at the front.
      if (size >= MAX_BODY_BYTES) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }

  return new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
}

interface PageSnapshot {
  title: string | null
  canonical: string | null
  hasJsonLd: boolean
  /** Everything after `</head>`. */
  body: string
}

/**
 * Read one page's `<head>` facts and its body text out of raw HTML.
 *
 * ⚠ **Regex, not a parser, and that is a bounded decision rather than a
 * shortcut.** Every value compared is one *we* generated, so the only question
 * is whether that exact string came back — not worth a parser dependency for a
 * warning channel.
 */
export function parsePageHtml(html: string): PageSnapshot {
  const headEnd = html.search(/<\/head\s*>/i)
  const head = headEnd === -1 ? html : html.slice(0, headEnd)
  const body = headEnd === -1 ? html : html.slice(headEnd)

  const title = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head)?.[1] ?? null
  const canonical =
    /<link\b[^>]*\brel\s*=\s*["']?canonical["']?[^>]*>/i
      .exec(head)?.[0]
      ?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? null

  return {
    title: title === null ? null : decodeEntities(title).trim(),
    canonical: canonical === null ? null : decodeEntities(canonical).trim(),
    // Anywhere: a host is free to put it in either half.
    hasJsonLd: /<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html),
    body,
  }
}

/** Compare two URLs the way a `<link rel=canonical>` should be compared. */
export function sameUrl(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const normalize = (value: string): string | null => {
    const url = URL.parse(value)
    if (!url) return null
    // A trailing slash on the path is not a different page, and a host's case is
    // not either. Everything else — the query included — is.
    const path = url.pathname.replace(/\/+$/, '')
    return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`
  }
  const left = normalize(a)
  return left !== null && left === normalize(b)
}

/**
 * The distinctive body text to look for on one page, or `null` (`skipped`).
 *
 * ⚠ **Never the page title.** A theme renders the title in the body too, so it
 * passes on a page whose crawlable children never arrived — the failure this
 * check exists to catch.
 */
export function bodyProbe(seo: AtlasSeoDocument): string | null {
  if (seo.type === 'region') {
    const event = seo.content.events.find((card) => card.title)
    return event?.title ?? seo.content.subtitle ?? null
  }
  if (seo.type === 'event') {
    return seo.content.schedule.oneLine || seo.content.address?.oneLine || null
  }
  return seo.content.paragraphs.find((paragraph) => paragraph.trim().length > 0) ?? null
}

type Verdict = { status: SeoCheckResult['status']; detail?: string }

/**
 * Longest `detail` stored.
 *
 * ⚠ **A `detail` quotes the remote page**, so its length is the other end's
 * choice. Bounded here, where every verdict is built, rather than at the row,
 * the tab and the email.
 */
const MAX_DETAIL_LENGTH = 300

const clamp = (detail: string): string =>
  detail.length <= MAX_DETAIL_LENGTH ? detail : `${detail.slice(0, MAX_DETAIL_LENGTH - 1)}…`

const pass = (): Verdict => ({ status: 'pass' })
const fail = (detail: string): Verdict => ({ status: 'fail', detail: clamp(detail) })
const skip = (detail: string): Verdict => ({ status: 'skipped', detail: clamp(detail) })

/** Closed, not `Partial`, so a mis-keyed check is a compile error. */
type PageVerdicts = Record<Exclude<SeoCheckId, 'sitemap'>, Verdict>

/**
 * The four page checks. Each failure names what was expected and what arrived,
 * which is what a volunteer can act on.
 */
export function comparePage(args: {
  seo: AtlasSeoDocument
  snapshot: PageSnapshot
  /** The expected canonical whenever the endpoint answered none. */
  pageUrl: string
}): PageVerdicts {
  const { seo, snapshot, pageUrl } = args

  const expectedCanonical = seo.canonical ?? pageUrl
  const probe = bodyProbe(seo)

  return {
    title:
      snapshot.title === null
        ? fail('The page has no title.')
        : snapshot.title === seo.title
          ? pass()
          : fail(`The page title should be “${seo.title}”, but it is “${snapshot.title}”.`),
    canonical:
      snapshot.canonical === null
        ? fail('The page does not say which address is its main one.')
        : sameUrl(snapshot.canonical, expectedCanonical)
          ? pass()
          : fail(
              `The page should name ${expectedCanonical} as its main address, but names ${snapshot.canonical}.`,
            ),
    'json-ld': snapshot.hasJsonLd
      ? pass()
      : fail('The page is missing the class details search engines read (structured data).'),
    body:
      probe === null
        ? skip('This page has no distinctive text to look for.')
        : snapshot.body.includes(probe)
          ? pass()
          : fail(`The page text does not include “${probe}”.`),
  }
}

/**
 * Does a sitemap this site publishes list `target`?
 *
 * **Platform-agnostic on purpose**: it looks where every crawler looks — the
 * `Sitemap:` lines in `robots.txt`, plus `/sitemap.xml`. One level of
 * `<sitemapindex>` is read, so a malformed index is not a crawl.
 */
export async function siteListsUrl(args: {
  origin: string
  target: string
  fetchFn?: FetchPage
}): Promise<Verdict> {
  const { origin, target } = args
  const get = args.fetchFn ?? fetchPage

  const host = URL.parse(origin)?.host
  if (!host) return skip('This page has no resolvable origin.')

  const robots = await get(`${origin}/robots.txt`, { sameHost: host })
  const declared = robots.ok ? sitemapLinesFrom(robots.body, host) : []
  // Whatever robots.txt said: publishing the file and forgetting the line is common.
  const queue = [...declared, `${origin}/sitemap.xml`]

  const seen = new Set<string>()
  let read = 0
  let reachable = false

  while (queue.length > 0 && read < MAX_SITEMAP_DOCUMENTS) {
    const url = queue.shift() as string
    if (seen.has(url)) continue
    seen.add(url)

    // ⚠ `sameHost`, not a check on the answer: an on-host candidate can still redirect off it.
    const document = await get(url, { sameHost: host })
    read++
    if (!document.ok) continue
    reachable = true

    const locations = locationsFrom(document.body)
    if (locations.some((location) => sameUrl(location, target))) return pass()

    if (/<sitemapindex\b/i.test(document.body)) {
      for (const child of childSitemaps(locations, host)) {
        if (!seen.has(child)) queue.push(child)
      }
    }
  }

  return reachable
    ? fail(`Your site’s sitemap does not list ${target} yet.`)
    : skip('This site publishes no sitemap we could reach.')
}

/**
 * Is this URL on the host the check is about?
 *
 * ⚠ **Half the SSRF bound, and the reason it is a bound rather than a filter.**
 * The `Sitemap:` lines and `<loc>` children are URLs a third party chose, and
 * unrestricted they make this a reachability oracle for the Railway network:
 * the stored, emailed verdict differs between "a document answered" and
 * "nothing did". A sitemap on another domain is deliberately not followed.
 *
 * ⚠ **The other half is {@link FetchPageOptions.sameHost}, and this function
 * cannot stand in for it**: it leaves the redirect chain unjudged.
 */
function isOnHost(url: string, host: string): boolean {
  return URL.parse(url)?.host.toLowerCase() === host.toLowerCase()
}

/**
 * `raw` as an absolute http(s) URL on `host`, or nothing. A `<loc>` is as
 * caller-supplied as a `Sitemap:` line, and both feed the one queue.
 */
function onHostHref(raw: string, host: string): string[] {
  const url = URL.parse(raw)
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return []
  return isOnHost(url.href, host) ? [url.href] : []
}

/** The `<loc>` children of a sitemap index, on this host only. */
function childSitemaps(locations: readonly string[], host: string): string[] {
  return locations.flatMap((location) => onHostHref(location, host)).slice(0, MAX_INDEX_ENTRIES)
}

/** The `Sitemap:` lines a `robots.txt` declares, absolute and on this host only. */
function sitemapLinesFrom(robots: string, host: string): string[] {
  return robots.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*sitemap\s*:\s*(\S+)\s*$/i.exec(line)
    return match ? onHostHref(match[1], host) : []
  })
}

/** Every `<loc>` in a sitemap or a sitemap index. */
function locationsFrom(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) =>
    match[1].replace(/&amp;/g, '&'),
  )
}

/** Injected, with the client and locale baked in — see the module docblock. */
interface SeoAuditResolvers {
  resolveSeo: (route: string) => Promise<AtlasSeoDocument | null>
  resolveSitemap: () => Promise<AtlasSitemapUrl[]>
}

export interface SeoAuditDeps {
  fetchFn?: FetchPage
}

/**
 * The one region page checked, from the client's own sitemap: these run nightly
 * against somebody else's server. A region has a listing to look for, and the
 * shallowest is the most linked and least likely to have been re-slugged.
 */
export function sampleRegion(urls: readonly AtlasSitemapUrl[]): AtlasSitemapUrl | null {
  const regions = urls.filter((url) => {
    const segments = url.route.split('/').filter(Boolean)
    return segments.length > 0 && !/^\d+$/.test(segments[segments.length - 1])
  })
  if (regions.length === 0) return null
  return regions.reduce((shallowest, candidate) =>
    candidate.route.split('/').length < shallowest.route.split('/').length ? candidate : shallowest,
  )
}

/**
 * Run every check on the atlas root and one sampled region.
 *
 * The sitemap check runs on the region alone: a site lists its own mount for
 * reasons that have nothing to do with us, so finding the root proves nothing.
 */
export async function runSeoChecks(args: {
  verified: VerifiedEmbed
  routing: RoutingMode
  resolvers: SeoAuditResolvers
  deps?: SeoAuditDeps
}): Promise<SeoCheckResult[]> {
  const { verified, routing, resolvers, deps = {} } = args
  const get = deps.fetchFn ?? fetchPage

  // ⚠ `canonicalMountUrl`, not `buildCanonicalUrl(target, '/')`, which refuses
  // `/` as a webPath. `routing` stays required, so no target is built from the
  // widget's own self-report (#644).
  const target = canonicalTargetForHost(verified, routing)
  const mountUrl = target ? canonicalMountUrl(target) : null
  if (!mountUrl) {
    return [
      {
        route: '/',
        check: 'title',
        status: 'skipped',
        detail: 'This service has no publishable canonical URL yet.',
      },
    ]
  }

  const pages: { route: string; url: string }[] = [{ route: '/', url: mountUrl }]

  const sitemap = await resolvers.resolveSitemap()
  const sample = sampleRegion(sitemap)
  if (sample) pages.push({ route: sample.route, url: sample.loc })

  // ⚠ **Overlapped, because the serial version could cost a minute per client**
  // — up to eight `FETCH_TIMEOUT_MS` waits on top of three browser renders, and
  // "Verify now" has to answer inside Cloudflare's 100s origin limit (#644).
  const sitemapCheck: Promise<SeoCheckResult> = sample
    ? checkSitemap(sample, get)
    : Promise.resolve({
        route: '/',
        check: 'sitemap',
        status: 'skipped',
        detail: 'This service owns no region page to look for yet.',
      })

  const pageResults = await Promise.all(pages.map((page) => checkPage(page, resolvers, get)))

  return [...pageResults.flat(), await sitemapCheck]
}

async function checkPage(
  page: { route: string; url: string },
  resolvers: SeoAuditResolvers,
  get: FetchPage,
): Promise<SeoCheckResult[]> {
  // ⚠ **Bounded to the mount's own host, like every sitemap fetch, and for a
  // sharper reason.** Two failures quote what came back, so a mount that 302s to
  // an internal address would read that address's title and canonical into the
  // stored detail and the manager's mail.
  const [seo, fetched] = await Promise.all([
    resolvers.resolveSeo(page.route),
    get(page.url, { sameHost: URL.parse(page.url)?.host ?? '' }),
  ])

  if (!seo) {
    return [
      {
        route: page.route,
        check: 'title',
        status: 'skipped',
        detail: 'The CMS no longer resolves this route.',
      },
    ]
  }

  if (fetched.detail === OFF_HOST) {
    // A real answer about the install, not "we could not look".
    return PAGE_CHECKS.map((check) => ({
      route: page.route,
      check,
      ...fail(`${page.url} redirects to another site, so search engines never see this page.`),
    }))
  }

  if (!fetched.ok) {
    // Could not look: skipped on every check, so the tab shows why.
    return PAGE_CHECKS.map((check) => ({
      route: page.route,
      check,
      status: 'skipped' as const,
      detail: clamp(fetched.detail ?? `The page answered ${fetched.status}.`),
    }))
  }

  const verdicts = comparePage({ seo, snapshot: parsePageHtml(fetched.body), pageUrl: page.url })
  return PAGE_CHECKS.map((check) => ({ route: page.route, check, ...verdicts[check] }))
}

async function checkSitemap(sample: AtlasSitemapUrl, get: FetchPage): Promise<SeoCheckResult> {
  const origin = URL.parse(sample.loc)?.origin
  const verdict = origin
    ? await siteListsUrl({ origin, target: sample.loc, fetchFn: get })
    : skip('This page has no resolvable origin.')
  return { route: sample.route, check: 'sitemap', ...verdict }
}
