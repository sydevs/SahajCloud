import type { AtlasSeoResponse, AtlasSitemapUrl } from '@/endpoints/responseTypes'
import { canonicalMountUrl, canonicalTargetForHost } from '@/lib/atlas/canonicalUrl'
import type { RoutingMode } from '@/lib/clients/canonical'
import type { SeoCheckId, SeoCheckResult, VerifiedEmbed } from '@/lib/clients/verification'

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

/** How many `<loc>` entries one sitemap index may contribute. */
const MAX_INDEX_ENTRIES = 20

/** What one fetch came back with, or why it did not. */
export interface FetchedPage {
  ok: boolean
  status: number
  body: string
  detail?: string
}

export type FetchPage = (url: string) => Promise<FetchedPage>

/**
 * Fetch one document as a crawler would, and **never throw**.
 *
 * The same contract `browserRendering` keeps, for the same reason: the caller
 * has to tell "their page is wrong" from "we could not look", and an exception
 * erases that distinction. A refused fetch is `skipped`, never `fail`.
 */
export const fetchPage: FetchPage = async (url) => {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        // Named, so an operator reading their own access log can tell what hit
        // them, and so a site may allowlist us if it challenges unknown agents.
        'User-Agent': 'SahajCloud-SEO-Check (+https://github.com/sydevs/SahajCloud)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const body = response.ok ? await response.text() : ''
    return { ok: response.ok, status: response.status, body }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: '',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
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

/** The five entities our own escaping writes, decoded for comparison. */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

/**
 * Decode the entities a host's template escaped on the way out.
 *
 * A `<title>` we sent as `Classes in Côte & Loire` arrives as
 * `Classes in Côte &amp; Loire`, and comparing the escaped form would report
 * every title containing an ampersand as wrong. Only the five named entities
 * plus numeric escapes are decoded — this is a comparison, not a sanitizer, and
 * nothing is re-emitted.
 */
function decodeEntities(value: string): string {
  return value
    .replace(
      /&(?:amp|lt|gt|quot|#39|apos);/gi,
      (entity) => ENTITIES[entity.toLowerCase()] ?? entity,
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
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
export function bodyProbe(seo: AtlasSeoResponse): string | null {
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

const pass = (): Verdict => ({ status: 'pass' })
const fail = (detail: string): Verdict => ({ status: 'fail', detail })
const skip = (detail: string): Verdict => ({ status: 'skipped', detail })

/**
 * The four page checks, given what the endpoint answered and what came back.
 *
 * Each failure's `detail` names what was expected and what arrived, because the
 * tab shows it next to the step to redo and "the title is wrong" without the two
 * values is not something a volunteer can act on.
 */
export function comparePage(args: {
  seo: AtlasSeoResponse
  snapshot: PageSnapshot
  /** The URL fetched, which is the canonical whenever the endpoint answered none. */
  pageUrl: string
}): Partial<Record<SeoCheckId, Verdict>> {
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

  const robots = await get(`${origin}/robots.txt`)
  const declared = robots.ok ? sitemapLinesFrom(robots.body) : []
  // `/sitemap.xml` is tried whatever robots.txt said: a site that publishes the
  // file and forgets the line is the common case, and that is a warning about
  // the line rather than about the page.
  const queue = dedupe([...declared, `${origin}/sitemap.xml`]).slice(0, MAX_SITEMAP_DOCUMENTS)
  if (queue.length === 0) return skip('This site publishes no sitemap we could find.')

  const seen = new Set<string>()
  let read = 0
  let reachable = false

  while (queue.length > 0 && read < MAX_SITEMAP_DOCUMENTS) {
    const url = queue.shift() as string
    if (seen.has(url)) continue
    seen.add(url)

    const document = await get(url)
    read++
    if (!document.ok) continue
    reachable = true

    const locations = locationsFrom(document.body)
    if (locations.some((location) => sameUrl(location, target))) return pass()

    if (/<sitemapindex\b/i.test(document.body)) {
      for (const child of locations.slice(0, MAX_INDEX_ENTRIES)) {
        if (!seen.has(child)) queue.push(child)
      }
    }
  }

  return reachable
    ? fail(`No sitemap on this site lists ${target}.`)
    : skip('This site publishes no sitemap we could reach.')
}

/** The `Sitemap:` lines a `robots.txt` declares, absolute URLs only. */
function sitemapLinesFrom(robots: string): string[] {
  const urls: string[] = []
  for (const line of robots.split(/\r?\n/)) {
    const match = /^\s*sitemap\s*:\s*(\S+)\s*$/i.exec(line)
    const url = match ? URL.parse(match[1]) : null
    if (url && (url.protocol === 'http:' || url.protocol === 'https:')) urls.push(url.href)
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
  resolveSeo: (route: string) => Promise<AtlasSeoResponse | null>
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
  const results: SeoCheckResult[] = []

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

  for (const page of pages) {
    const seo = await resolvers.resolveSeo(page.route)
    if (!seo) {
      results.push({
        route: page.route,
        check: 'title',
        status: 'skipped',
        detail: 'The CMS no longer resolves this route.',
      })
      continue
    }

    const fetched = await get(page.url)
    if (!fetched.ok) {
      // Could not look. Reported as skipped on every check, so the tab shows
      // why rather than five blanks.
      for (const check of ['title', 'canonical', 'json-ld', 'body'] as const) {
        results.push({
          route: page.route,
          check,
          status: 'skipped',
          detail: fetched.detail ?? `The page answered ${fetched.status}.`,
        })
      }
      continue
    }

    const verdicts = comparePage({ seo, snapshot: parsePageHtml(fetched.body), pageUrl: page.url })
    for (const [check, verdict] of Object.entries(verdicts)) {
      if (verdict) results.push({ route: page.route, check: check as SeoCheckId, ...verdict })
    }
  }

  if (sample) {
    const origin = URL.parse(sample.loc)?.origin
    const verdict = origin
      ? await siteListsUrl({ origin, target: sample.loc, fetchFn: get })
      : skip('This page has no resolvable origin.')
    results.push({ route: sample.route, check: 'sitemap', ...verdict })
  } else {
    results.push({
      route: '/',
      check: 'sitemap',
      status: 'skipped',
      detail: 'This service owns no region page to look for yet.',
    })
  }

  return results
}
