import type { AtlasSeoDocument } from '@/endpoints/atlas/seo/seoDocument'
import type { AtlasSitemapUrl } from '@/endpoints/responseTypes'
import { canonicalMountUrl, canonicalTargetForHost } from '@/lib/atlas/canonicalUrl'
import type { RoutingMode } from '@/lib/clients/canonical'
import type { SeoCheckId, SeoCheckResult, VerifiedEmbed } from '@/lib/clients/verification'

import { decodeEntities } from './readinessMarker'

/**
 * Whether a verified embed is actually publishing the metadata we gave it
 * (#1055).
 *
 * **What this adds to `verifyEmbed`, which already loads the page.** That one
 * asks whether the widget booted, in a real browser, because the widget is
 * JavaScript. This asks the opposite question: whether what a **crawler** sees —
 * raw HTML, no JavaScript — carries the `<title>`, canonical, JSON-LD and
 * crawlable body the SEO endpoint answered. A host can pass one and fail the
 * other in both directions, and the second failure is invisible to everyone: the
 * page looks perfect to the volunteer who installed it, and is unindexable.
 *
 * **Plain HTTP, deliberately.** A headless render would show the page *after*
 * the widget replaced its own children, which is exactly the state no crawler
 * is in. `fetch` is also two orders of magnitude cheaper, which is what lets
 * this run on every nightly verification rather than on a button.
 *
 * ⚠ **Every result is a warning, never a failure.** Nothing here reaches
 * `failureCount`, so nothing here can withdraw a working site's canonical URLs.
 * `nextSeoCheckState` owns that rule and its docblock says why.
 *
 * ⚠ **The resolvers are injected rather than imported.** They live in the
 * endpoint folders that own them (`docs/rules/endpoints.md`), and taking them as
 * arguments is also what makes this whole module testable with no database and
 * no network — `tests/unit/seo-checks.spec.ts` drives all five checks that way.
 */

/** How long one page or sitemap fetch may take. A crawler is not waiting on us. */
const FETCH_TIMEOUT_MS = 8000

/** How many sitemap documents one check will read, index entries included. */
const MAX_SITEMAP_DOCUMENTS = 6

/**
 * The checks a single page answers, in the order the tab shows them.
 *
 * Named once so the fetch-failed branch and the compare branch cannot cover
 * different sets — which is what a `Partial` and a hand-written list allowed.
 */
const PAGE_CHECKS = ['title', 'canonical', 'json-ld', 'body'] as const

/** How many `<loc>` entries one sitemap index may contribute. */
const MAX_INDEX_ENTRIES = 20

/** What one fetch came back with, or why it did not. */
export interface FetchedPage {
  ok: boolean
  status: number
  body: string
  /** Where the response actually came from, after redirects. */
  url?: string
  detail?: string
}

/** How a caller bounds one fetch. */
export interface FetchPageOptions {
  /**
   * Refuse a redirect that leaves this host, instead of following it.
   *
   * ⚠ **Set this for every URL a third party chose.** `redirect: 'follow'`
   * issues the request to the redirect target and reads its body, so a host
   * check applied to `response.url` afterwards discards an answer the process
   * already went and fetched — which is the whole of the hole {@link isOnHost}
   * exists to close, one hop further out. A `Sitemap:` line on the host under
   * check that 302s to an internal address is exactly that hop.
   */
  sameHost?: string
}

export type FetchPage = (url: string, options?: FetchPageOptions) => Promise<FetchedPage>

/** Same-host redirects one bounded fetch will follow before giving up. */
const MAX_SAME_HOST_REDIRECTS = 4

/** The statuses that carry a `Location` worth following. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * Most bytes of one document we will read.
 *
 * ⚠ **A cap, because the other end is not ours.** Every value compared here is
 * in the `<head>` or the first screen of the body, so a megabyte is already far
 * more than any check needs — and without a bound a hostile or merely broken
 * host can stream whatever it manages inside the timeout straight into this
 * process's heap, once per page and up to {@link MAX_SITEMAP_DOCUMENTS} times
 * again, with the nightly job walking every due client in turn.
 */
const MAX_BODY_BYTES = 1_024 * 1_024

/**
 * Fetch one document as a crawler would, and **never throw**.
 *
 * The same contract `browserRendering` keeps, for the same reason: the caller
 * has to tell "their page is wrong" from "we could not look", and an exception
 * erases that distinction. A refused fetch is `skipped`, never `fail`.
 */
export const fetchPage: FetchPage = async (url, options = {}) => {
  const { sameHost } = options
  try {
    // Unbounded, the platform follows redirects for us. Bounded, every hop has
    // to be inspected before it is taken, so `manual` is the only mode that
    // can refuse one — Node hands back the real 3xx with its `Location`.
    let current = url
    for (let hop = 0; ; hop++) {
      const response = await fetch(current, {
        redirect: sameHost ? 'manual' : 'follow',
        headers: {
          // Named, so an operator reading their own access log can tell what hit
          // them, and so a site may allowlist us if it challenges unknown agents.
          'User-Agent': 'SahajCloud-SEO-Check (+https://github.com/sydevs/SahajCloud)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      const location =
        sameHost && REDIRECT_STATUSES.has(response.status) ? response.headers.get('location') : null
      if (!sameHost || !location) {
        return {
          ok: response.ok,
          status: response.status,
          // `response.url` is the address after redirects, which is what a caller
          // restricting itself to one host has to check.
          url: response.url || current,
          body: response.ok ? await readCapped(response) : '',
        }
      }

      const next = URL.parse(location, current)
      if (!next || !isOnHost(next.href, sameHost)) {
        return { ok: false, status: response.status, body: '', url: current, detail: OFF_HOST }
      }
      if (hop >= MAX_SAME_HOST_REDIRECTS) {
        return { ok: false, status: response.status, body: '', url: current, detail: TOO_MANY_HOPS }
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

/** Why a bounded fetch gave up. Named so a spec can assert on them. */
export const OFF_HOST = 'The redirect left the host under check, so it was not followed.'
export const TOO_MANY_HOPS = 'Too many redirects on this host.'

/** The first {@link MAX_BODY_BYTES} of a response, decoded as UTF-8. */
async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  // A truthful oversize header saves opening the stream at all.
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
      // Stop reading rather than refusing what arrived: the `<head>` is at the
      // front, so a truncated body still answers every check honestly.
      if (size >= MAX_BODY_BYTES) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }

  return new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
}

/** What a crawler can see on one page, read off the raw HTML. */
export interface PageSnapshot {
  title: string | null
  canonical: string | null
  hasJsonLd: boolean
  /** Everything after `</head>`, which is where a crawlable body has to be. */
  body: string
}

/**
 * Read one page's `<head>` facts and its body text out of raw HTML.
 *
 * ⚠ **Regex, not a parser, and that is a bounded decision rather than a
 * shortcut.** Every value compared here is one *we* generated and handed to the
 * host, so the question is only whether that exact string came back — never
 * what the document means. Adding an HTML parser to answer a presence check
 * would be a dependency on every deploy for a warning channel. What it costs is
 * stated at each check that could be fooled.
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
    // `ld+json` anywhere, since a host is free to put it in either half.
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
 * The distinctive body text to look for on one page.
 *
 * ⚠ **Never the page title.** A theme renders the title in the body as well as
 * the head, so a title-shaped probe passes on a page whose crawlable children
 * never arrived — the exact failure this check exists to catch. So the probe is
 * taken from `content` instead: a class's name on a region page, the schedule or
 * address line on an event, the first authored paragraph on the root.
 *
 * `null` means there is nothing distinctive to look for, which is `skipped` and
 * not `fail` — a region with no classes and a locale with no landing copy are
 * both ordinary.
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

/** One check's verdict, before it is tagged with the route it ran on. */
type Verdict = { status: SeoCheckResult['status']; detail?: string }

/**
 * Longest `detail` stored.
 *
 * ⚠ **A `detail` quotes the remote page**, so its length is the other end's
 * choice: a failing title check embeds whatever that host put in `<title>`. It
 * is stored on the `clients` row, re-read on every Install tab load, and
 * emailed — so it is bounded here, where every verdict is built, rather than at
 * three sinks.
 */
const MAX_DETAIL_LENGTH = 300

const clamp = (detail: string): string =>
  detail.length <= MAX_DETAIL_LENGTH ? detail : `${detail.slice(0, MAX_DETAIL_LENGTH - 1)}…`

const pass = (): Verdict => ({ status: 'pass' })
const fail = (detail: string): Verdict => ({ status: 'fail', detail: clamp(detail) })
const skip = (detail: string): Verdict => ({ status: 'skipped', detail: clamp(detail) })

/**
 * The four checks one page answers, each always present.
 *
 * A closed record rather than a `Partial`: the caller spread it with
 * `Object.entries`, which widens the key to `string`, so a `Partial` bought a
 * `if (verdict)` guard and a `check as SeoCheckId` assertion — the one
 * assertion in the module, sitting exactly where a mis-keyed check would be
 * accepted silently.
 */
export type PageVerdicts = Record<Exclude<SeoCheckId, 'sitemap'>, Verdict>

/**
 * The four page checks, given what the endpoint answered and what came back.
 *
 * Each failure's `detail` names what was expected and what arrived, because the
 * tab shows it next to the step to redo and "the title is wrong" without the two
 * values is not something a volunteer can act on.
 */
export function comparePage(args: {
  seo: AtlasSeoDocument
  snapshot: PageSnapshot
  /** The URL fetched, which is the canonical whenever the endpoint answered none. */
  pageUrl: string
}): PageVerdicts {
  const { seo, snapshot, pageUrl } = args

  const expectedCanonical = seo.canonical ?? pageUrl
  const probe = bodyProbe(seo)

  return {
    title:
      snapshot.title === null
        ? fail('The page has no <title> element at all.')
        : snapshot.title === seo.title
          ? pass()
          : fail(`Expected “${seo.title}”, the page says “${snapshot.title}”.`),
    canonical:
      snapshot.canonical === null
        ? fail('The page publishes no <link rel="canonical">.')
        : sameUrl(snapshot.canonical, expectedCanonical)
          ? pass()
          : fail(`Expected ${expectedCanonical}, the page says ${snapshot.canonical}.`),
    'json-ld': snapshot.hasJsonLd
      ? pass()
      : fail('No <script type="application/ld+json"> block on the page.'),
    body:
      probe === null
        ? skip('This page has no distinctive text to look for.')
        : snapshot.body.includes(probe)
          ? pass()
          : fail(`The page body does not contain “${probe}”.`),
  }
}

/**
 * Does a sitemap this site publishes list `target`?
 *
 * **Platform-agnostic on purpose.** Four SEO plugins and two site builders each
 * publish a sitemap in their own place, and adapting to each is how
 * SahajAtlasWordpress ended up deciding to serve one file and point every system
 * at it. So this looks where every crawler looks: the `Sitemap:` lines in
 * `robots.txt`, which is the line that actually matters, plus `/sitemap.xml` as
 * the convention almost everything also honours.
 *
 * **One level of index.** A `<sitemapindex>` has its children read, and their
 * children are not. Both bounds are real: `MAX_SITEMAP_DOCUMENTS` caps the
 * fetches a single check can make against somebody else's server, and the depth
 * cap stops a malformed index from being a crawl.
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
  // `/sitemap.xml` is tried whatever robots.txt said: a site that publishes the
  // file and forgets the line is the common case, and that is a warning about
  // the line rather than about the page.
  const queue = dedupe([...declared, `${origin}/sitemap.xml`]).slice(0, MAX_SITEMAP_DOCUMENTS)

  const seen = new Set<string>()
  let read = 0
  let reachable = false

  while (queue.length > 0 && read < MAX_SITEMAP_DOCUMENTS) {
    const url = queue.shift() as string
    if (seen.has(url)) continue
    seen.add(url)

    // ⚠ `sameHost`, not a check on the answer: a candidate that passed the
    // check above can still redirect off-host, and a verdict that discards
    // that answer has already made the process fetch it. The re-check stays
    // too — it costs nothing and it is what holds if the bound ever moves.
    const document = await get(url, { sameHost: host })
    read++
    if (!document.ok || !isOnHost(document.url ?? url, host)) continue
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
    ? fail(`No sitemap on this site lists ${target}.`)
    : skip('This site publishes no sitemap we could reach.')
}

/**
 * Is this URL on the host the check is about?
 *
 * ⚠ **Half the SSRF bound, and the reason it is a bound rather than a filter.**
 * This is the first code path that makes the CMS process itself fetch a URL a
 * third party chose: the `Sitemap:` lines of somebody else's `robots.txt`, and
 * the `<loc>` children of their sitemap index. Unrestricted, a volunteer's own
 * site — or anyone who can write a line into its `robots.txt` — turns this into
 * a reachability oracle for the Railway network, since the verdict stored on the
 * row and emailed differs between "a document answered" and "nothing did".
 *
 * Restricting to the one host keeps every fetch pointed where the check already
 * assumed it was pointed. A sitemap hosted on a different domain is a real
 * pattern, and deliberately not one this check follows.
 *
 * ⚠ **The other half is {@link FetchPageOptions.sameHost}, and this function
 * cannot stand in for it.** Judging a URL before the fetch leaves the redirect
 * chain unjudged, and a redirect is taken by the platform before any caller
 * sees an answer to discard. Every candidate here is fetched bounded.
 */
function isOnHost(url: string, host: string): boolean {
  return URL.parse(url)?.host.toLowerCase() === host.toLowerCase()
}

/** The `<loc>` children of a sitemap index, on this host only. */
function childSitemaps(locations: readonly string[], host: string): string[] {
  const children: string[] = []
  for (const location of locations) {
    const url = URL.parse(location)
    // The scheme is checked here too: a `<loc>` is as caller-supplied as a
    // `Sitemap:` line, and this is the queue both feed.
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) continue
    if (!isOnHost(url.href, host)) continue
    children.push(url.href)
    if (children.length >= MAX_INDEX_ENTRIES) break
  }
  return children
}

/** The `Sitemap:` lines a `robots.txt` declares, absolute and on this host only. */
function sitemapLinesFrom(robots: string, host: string): string[] {
  const urls: string[] = []
  for (const line of robots.split(/\r?\n/)) {
    const match = /^\s*sitemap\s*:\s*(\S+)\s*$/i.exec(line)
    const url = match ? URL.parse(match[1]) : null
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) continue
    if (!isOnHost(url.href, host)) continue
    urls.push(url.href)
  }
  return urls
}

/** Every `<loc>` in a sitemap or a sitemap index. */
function locationsFrom(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) =>
    match[1].replace(/&amp;/g, '&'),
  )
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

/**
 * The two resolutions the audit needs, injected — see the module docblock.
 *
 * The caller bakes in the locale as well as the client, because both are facts
 * about whose install is being checked rather than about the checking.
 */
export interface SeoAuditResolvers {
  resolveSeo: (route: string) => Promise<AtlasSeoDocument | null>
  resolveSitemap: () => Promise<AtlasSitemapUrl[]>
}

export interface SeoAuditDeps {
  fetchFn?: FetchPage
}

/**
 * The sampled region, from the client's own sitemap.
 *
 * One page, not all of them: these checks run nightly against somebody else's
 * server, and a client owning a country has hundreds of routes. A region rather
 * than a class, because a region page is the one with a listing to look for and
 * is what a client's own navigation links to — and the shallowest one, because
 * that is the page most likely to be linked and least likely to have been
 * re-slugged.
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
 * The root is always checked, because every host mounts it and it is the page a
 * client links from its own nav. The sitemap check runs on the sampled region
 * alone: the root's URL is the mount itself, which a site's own sitemap lists
 * for reasons that have nothing to do with us, so finding it there would prove
 * nothing.
 */
export async function runSeoChecks(args: {
  verified: VerifiedEmbed
  routing: RoutingMode
  resolvers: SeoAuditResolvers
  deps?: SeoAuditDeps
}): Promise<SeoCheckResult[]> {
  const { verified, routing, resolvers, deps = {} } = args
  const get = deps.fetchFn ?? fetchPage

  // ⚠ `canonicalMountUrl`, not `buildCanonicalUrl(target, '/')`: the root's page
  // *is* the mount, and `buildCanonicalUrl` refuses `/` as a webPath because no
  // document has that path. The `routing` argument is still required, so a
  // target cannot be built from the widget's own self-report (#644).
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

  // ⚠ **Overlapped, because the serial version could cost a minute per client.**
  // Each page is an independent resolve plus an independent fetch, the pages are
  // independent of each other, and the sitemap check depends only on the sample
  // — so end to end the old order was up to eight `FETCH_TIMEOUT_MS` waits,
  // inside a job that walks every due client in turn and on top of the three
  // browser renders a verification already spends. "Verify now" has to answer
  // inside Cloudflare's 100s origin limit, which is what #644 rearranged the
  // routing probe for.
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

/** Every check one page answers, or why none could be answered. */
async function checkPage(
  page: { route: string; url: string },
  resolvers: SeoAuditResolvers,
  get: FetchPage,
): Promise<SeoCheckResult[]> {
  // The resolve and the fetch are independent: the page URL is known before
  // either, so waiting for the CMS before asking the host is pure latency.
  //
  // Unbounded, unlike every sitemap fetch: this URL is built from the mount an
  // operator designated and verification confirmed, not from a line somebody
  // wrote in a file we read. A site that redirects its own mount to `www` or
  // to https is ordinary, and refusing that hop would report it as unindexable.
  const [seo, fetched] = await Promise.all([resolvers.resolveSeo(page.route), get(page.url)])

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

  if (!fetched.ok) {
    // Could not look. Reported as skipped on every check, so the tab shows why
    // rather than four blanks.
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

/** Whether a sitemap the site publishes lists the sampled page. */
async function checkSitemap(sample: AtlasSitemapUrl, get: FetchPage): Promise<SeoCheckResult> {
  const origin = URL.parse(sample.loc)?.origin
  const verdict = origin
    ? await siteListsUrl({ origin, target: sample.loc, fetchFn: get })
    : skip('This page has no resolvable origin.')
  return { route: sample.route, check: 'sitemap', ...verdict }
}
