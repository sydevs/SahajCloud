import type { AtlasSeoDocument } from '@/endpoints/atlas/seo/seoDocument'
import type { AtlasSitemapUrl } from '@/endpoints/responseTypes'
import { canonicalMountUrl } from '@/lib/atlas/canonicalUrl'
import { isValidCanonicalDomain } from '@/lib/clients/canonical'
import { siteHosts } from '@/lib/clients/site'
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

/**
 * The whole pass's budget, shared by every fetch in it.
 *
 * ⚠ **"Verify now" must answer inside Cloudflare's 100 s origin limit** (#644),
 * after a browser verification of up to 45 s — and the pass runs beside the
 * routing probe, so this, not the sum of its fetches, is what it adds.
 */
const SEO_PASS_DEADLINE_MS = 40_000

/** Sitemap documents one check will read, index entries included — and so queued. */
const MAX_SITEMAP_DOCUMENTS = 6

/** In the tab's order. One list, so every branch covers the same set. */
const PAGE_CHECKS = ['title', 'canonical', 'json-ld', 'body'] as const

export interface FetchedPage {
  ok: boolean
  status: number
  body: string
  detail?: string
}

interface FetchPageOptions {
  /**
   * The site's hosts — its domain and www twin (`siteHosts`). A redirect that
   * leaves them is refused rather than followed.
   *
   * ⚠ **Judged before each hop, never on the answer.** A followed redirect has
   * already issued the request — a `Sitemap:` line that 302s to an internal
   * address is the hole {@link onHost} closes, one hop further out.
   */
  hosts: readonly string[]
  /** The pass's shared deadline ({@link SEO_PASS_DEADLINE_MS}). */
  signal?: AbortSignal
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
export const fetchPage: FetchPage = async (url, { hosts, signal }) => {
  try {
    // One budget for the whole chain, not one per hop.
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS)
    const bound = signal ? AbortSignal.any([timeout, signal]) : timeout
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
        signal: bound,
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

      const next = onHost(URL.parse(location, current)?.href ?? '', hosts)
      if (!next) {
        return { ok: false, status: response.status, body: '', detail: OFF_HOST }
      }
      if (hop >= MAX_SAME_HOST_REDIRECTS) {
        return { ok: false, status: response.status, body: '', detail: TOO_MANY_HOPS }
      }
      current = next
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

  return new TextDecoder('utf-8').decode(Buffer.concat(chunks))
}

interface PageSnapshot {
  title: string | null
  canonical: string | null
  hasJsonLd: boolean
  /** Everything after `</head>`, entities decoded, as the CMS text it is compared with is. */
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
      ?.match(/\bhref\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? null

  return {
    title: title === null ? null : decodeEntities(title).trim(),
    canonical: canonical === null ? null : decodeEntities(canonical).trim(),
    // Anywhere: a host is free to put it in either half.
    hasJsonLd: /<script\b[^>]*type\s*=\s*["']?application\/ld\+json/i.test(html),
    body: decodeEntities(body),
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
  target: string
  fetchFn?: FetchPage
  signal?: AbortSignal
}): Promise<Verdict> {
  const { target, signal } = args
  const get = args.fetchFn ?? fetchPage

  const url = URL.parse(target)
  if (!url) return skip('This page has no resolvable origin.')
  const { origin } = url
  const hosts = siteHosts(url.hostname)

  const robots = await get(`${origin}/robots.txt`, { hosts, signal })
  const declared = robots.ok
    ? [...robots.body.matchAll(/^\s*sitemap\s*:\s*(\S+)\s*$/gim)].map((match) => match[1])
    : []
  // Whatever robots.txt said: publishing the file and forgetting the line is common.
  const queue = [...declared, `${origin}/sitemap.xml`].flatMap(
    (candidate) => onHost(candidate, hosts) ?? [],
  )

  const seen = new Set<string>()
  let read = 0
  let reachable = false
  // Whether an index listed more than the check will read.
  let cut = false

  while (queue.length > 0 && read < MAX_SITEMAP_DOCUMENTS) {
    const next = queue.shift() as string
    if (seen.has(next)) continue
    seen.add(next)

    // ⚠ `hosts`, not a check on the answer: an on-host candidate can still redirect off it.
    const document = await get(next, { hosts, signal })
    read++
    if (!document.ok) continue
    reachable = true

    const locations = [...document.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) =>
      decodeEntities(match[1]),
    )
    if (locations.some((location) => sameUrl(location, target))) return pass()

    if (/<sitemapindex\b/i.test(document.body)) {
      const children = locations.flatMap((location) => onHost(location, hosts) ?? [])
      cut ||= children.length > MAX_SITEMAP_DOCUMENTS
      queue.push(...children.slice(0, MAX_SITEMAP_DOCUMENTS))
    }
  }

  // ⚠ **Unread sitemaps are no evidence the page is missing**: a plugin often
  // appends its own sitemap last in a long index.
  if (cut || queue.some((candidate) => !seen.has(candidate))) {
    return skip('Your site’s sitemaps are too many to read through, so this was not checked.')
  }
  return reachable
    ? fail(`Your site’s sitemap does not list ${target} yet.`)
    : skip('This site publishes no sitemap we could reach.')
}

/**
 * `raw` as an absolute https URL on one of `hosts`, or `null`.
 *
 * ⚠ **Half the SSRF bound, and the reason it is a bound rather than a filter.**
 * The `Sitemap:` lines and `<loc>` children are URLs a third party chose, and
 * unrestricted they make this a reachability oracle for the Railway network:
 * the stored, emailed verdict differs between "a document answered" and
 * "nothing did". A sitemap on another domain is deliberately not followed.
 *
 * ⚠ **The other half is {@link FetchPageOptions.sameHost}**, which applies this
 * to every redirect hop.
 */
function onHost(raw: string, hosts: readonly string[]): string | null {
  const url = URL.parse(raw)
  // https only: a plain-http hop is what a DNS-rebinding host would answer on,
  // and every page checked is https (`primaryPageUrl`).
  if (!url || url.protocol !== 'https:') return null
  return hosts.includes(url.host.toLowerCase()) ? url.href : null
}

/** Injected, with the client and locale baked in — see the module docblock. */
interface SeoAuditResolvers {
  resolveSeo: (route: string) => Promise<AtlasSeoDocument | null>
  resolveSitemap: () => Promise<AtlasSitemapUrl[]>
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
  resolvers: SeoAuditResolvers
  fetchFn?: FetchPage
}): Promise<SeoCheckResult[]> {
  const { verified, resolvers } = args
  const get = args.fetchFn ?? fetchPage
  const signal = AbortSignal.timeout(SEO_PASS_DEADLINE_MS)

  // ⚠ `canonicalMountUrl`, not `buildCanonicalUrl(target, '/')`, which refuses
  // `/` as a webPath. The domain is re-checked: the job writes it with raw SQL.
  const mountUrl = isValidCanonicalDomain(verified.domain)
    ? canonicalMountUrl({ origin: `https://${verified.domain}`, mount: verified.mount })
    : null
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

  // Overlapped, and bounded by one deadline — see `SEO_PASS_DEADLINE_MS`.
  const sitemapCheck: Promise<SeoCheckResult> = sample
    ? siteListsUrl({ target: sample.loc, fetchFn: get, signal }).then((verdict) => ({
        route: sample.route,
        check: 'sitemap' as const,
        ...verdict,
      }))
    : Promise.resolve({
        route: '/',
        check: 'sitemap',
        status: 'skipped',
        detail: 'This service owns no region page to look for yet.',
      })

  const [sitemapResult, ...pageResults] = await Promise.all([
    sitemapCheck,
    ...pages.map((page) => checkPage(page, resolvers, get, signal)),
  ])
  return [...pageResults.flat(), sitemapResult]
}

async function checkPage(
  page: { route: string; url: string },
  resolvers: SeoAuditResolvers,
  get: FetchPage,
  signal: AbortSignal,
): Promise<SeoCheckResult[]> {
  // ⚠ **Bounded to the mount's own host, like every sitemap fetch, and for a
  // sharper reason.** Two failures quote what came back, so a mount that 302s to
  // an internal address would read that address's title and canonical into the
  // stored detail and the manager's mail.
  const [seo, fetched] = await Promise.all([
    resolvers.resolveSeo(page.route),
    get(page.url, { hosts: siteHosts(URL.parse(page.url)?.hostname), signal }),
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
