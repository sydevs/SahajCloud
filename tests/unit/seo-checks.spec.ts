import type { AtlasSeoDocument } from '../../src/endpoints/atlas/seo/seoDocument'
import type { AtlasSitemapUrl } from '../../src/endpoints/responseTypes'
import type { FetchedPage } from '../../src/lib/embedVerification/seoChecks'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  EMPTY_VERIFICATION,
  nextSeoCheckState,
  seoFailureKey,
  type SeoCheckResult,
} from '../../src/lib/clients/verification'
import {
  bodyProbe,
  comparePage,
  fetchPage,
  OFF_HOST,
  parsePageHtml,
  runSeoChecks,
  sameUrl,
  sampleRegion,
  siteListsUrl,
} from '../../src/lib/embedVerification/seoChecks'

/**
 * The post-install SEO checks (#1055).
 *
 * ⚠ **Fixture pre-mortem.** Two shapes are assumed, and both are declared as
 * the real types so a drift is a compile error rather than a passing test about
 * a shape nothing returns:
 *
 * - `AtlasSeoDocument` — the discriminated union in
 *   `src/endpoints/responseTypes.ts`, so a region carries `content.events` with
 *   `title`, and the root carries `content.paragraphs`.
 * - `VerifiedEmbed` — `canonical.verification.verified`, whose required keys are
 *   `domain`, `mount`, `widgetVersion` and `at` (checked against
 *   `canonicalVerificationSchema` in `src/collections/Clients/Clients.ts`). The
 *   `routing: 'path'` the audit is given is the second argument, not a property,
 *   because `verified.routing` is legacy and no longer written (#644).
 */

const PAGE_URL = 'https://sahajayoga.ca/classes/ca/ontario'

type RegionAnswer = Extract<AtlasSeoDocument, { type: 'region' }>

const regionSeo = (
  overrides: Partial<Omit<RegionAnswer, 'content'>> & {
    content?: Partial<RegionAnswer['content']>
  } = {},
): AtlasSeoDocument => {
  const { content, ...rest } = overrides
  return {
    type: 'region',
    id: 7,
    route: '/ca/ontario',
    locale: 'en',
    title: 'Free meditation classes in Ontario',
    description: 'Twelve classes.',
    canonical: PAGE_URL,
    alternates: [],
    openGraph: {},
    jsonLdGraph: { '@context': 'https://schema.org', '@graph': [] },
    breadcrumbs: [],
    ...rest,
    content: {
      name: 'Ontario',
      subtitle: null,
      level: 'region',
      eventCount: 1,
      events: [
        {
          id: 1,
          route: '/ca/ontario/1',
          url: `${PAGE_URL}/1`,
          title: 'Thursday class',
          schedule: '',
          address: '',
          online: false,
        },
      ],
      ...content,
    },
  }
}

const pageHtml = (options: {
  title?: string | null
  canonical?: string | null
  jsonLd?: boolean
  body?: string
}): string => {
  const title = options.title === undefined ? 'Free meditation classes in Ontario' : options.title
  const canonical = options.canonical === undefined ? PAGE_URL : options.canonical
  return (
    '<!doctype html><html><head>' +
    (title === null ? '' : `<title>${title}</title>`) +
    (canonical === null ? '' : `<link rel="canonical" href="${canonical}" />`) +
    (options.jsonLd === false ? '' : '<script type="application/ld+json">{}</script>') +
    `</head><body>${options.body ?? '<h1>Ontario</h1><ul><li>Thursday class</li></ul>'}</body></html>`
  )
}

describe('parsePageHtml', () => {
  it('reads the title and canonical out of the head', () => {
    const snapshot = parsePageHtml(pageHtml({}))
    expect(snapshot.title).toBe('Free meditation classes in Ontario')
    expect(snapshot.canonical).toBe(PAGE_URL)
    expect(snapshot.hasJsonLd).toBe(true)
  })

  it('decodes the entities a host template escaped on the way out', () => {
    // Comparing the escaped form reports every title with an ampersand as wrong.
    expect(parsePageHtml(pageHtml({ title: 'C&ocirc;te &amp; Loire' })).title).toBe(
      'C&ocirc;te & Loire',
    )
    expect(parsePageHtml(pageHtml({ title: 'Caf&#233;' })).title).toBe('Café')
  })

  it('decodes a hex escape, which is how most serializers write an apostrophe', () => {
    // `Don&#x27;t` compared unequal to `Don't` and reported a correct page as
    // wrong — then emailed a manager about it.
    expect(parsePageHtml(pageHtml({ title: 'Don&#x27;t wait' })).title).toBe(
      'Don’t wait'.replace('’', "'"),
    )
    expect(parsePageHtml(pageHtml({ title: 'Don&#39;t wait' })).title).toBe("Don't wait")
  })

  it('decodes the ampersand last, so a double escape is not collapsed twice', () => {
    expect(parsePageHtml(pageHtml({ title: '&amp;lt;tag&amp;gt;' })).title).toBe('&lt;tag&gt;')
  })

  it('reads the canonical however the attributes are ordered or quoted', () => {
    expect(parsePageHtml(`<head><link href='${PAGE_URL}' rel=canonical></head>`).canonical).toBe(
      PAGE_URL,
    )
  })

  it('separates the body at </head>, which is where a crawlable body has to be', () => {
    const snapshot = parsePageHtml(pageHtml({ body: '<p>Thursday class</p>' }))
    expect(snapshot.body).toContain('Thursday class')
    expect(snapshot.body).not.toContain('<title>')
  })

  it('answers null rather than throwing on a page with no head at all', () => {
    const snapshot = parsePageHtml('<p>nothing</p>')
    expect(snapshot.title).toBeNull()
    expect(snapshot.canonical).toBeNull()
  })
})

describe('sameUrl', () => {
  it('ignores a trailing slash and the host case, which are not a different page', () => {
    expect(sameUrl('https://A.example.org/x/', 'https://a.example.org/x')).toBe(true)
  })

  it('does not ignore the query, which is a different page', () => {
    expect(sameUrl('https://a.example.org/x?atlas=/ca', 'https://a.example.org/x')).toBe(false)
  })

  it('is false for anything unparseable', () => {
    expect(sameUrl('not a url', 'https://a.example.org/x')).toBe(false)
    expect(sameUrl(null, 'https://a.example.org/x')).toBe(false)
  })
})

describe('bodyProbe', () => {
  it('never uses the title, which a theme renders in the body too', () => {
    // A title-shaped probe passes on a page whose crawlable children never
    // arrived — the exact failure this check exists to catch.
    expect(bodyProbe(regionSeo())).toBe('Thursday class')
  })

  it('falls back to the subtitle on a region with no classes', () => {
    expect(bodyProbe(regionSeo({ content: { events: [], subtitle: 'Twelve centres' } }))).toBe(
      'Twelve centres',
    )
  })

  it('is null when there is nothing distinctive, which is skipped not failed', () => {
    expect(bodyProbe(regionSeo({ content: { events: [], subtitle: null } }))).toBeNull()
  })
})

describe('comparePage', () => {
  const run = (html: string, seo = regionSeo()) =>
    comparePage({ seo, snapshot: parsePageHtml(html), pageUrl: PAGE_URL })

  it('passes a page publishing exactly what the endpoint answered', () => {
    const verdicts = run(pageHtml({}))
    for (const check of ['title', 'canonical', 'json-ld', 'body'] as const) {
      expect(verdicts[check]?.status, check).toBe('pass')
    }
  })

  it('names both values when the title disagrees', () => {
    const verdicts = run(pageHtml({ title: 'Ontario | Sahaja Yoga Canada' }))
    expect(verdicts.title?.status).toBe('fail')
    expect(verdicts.title?.detail).toContain('Free meditation classes in Ontario')
    expect(verdicts.title?.detail).toContain('Ontario | Sahaja Yoga Canada')
  })

  it('fails a page with no canonical at all', () => {
    expect(run(pageHtml({ canonical: null })).canonical?.status).toBe('fail')
  })

  it('accepts the page itself as the canonical where the endpoint answered none', () => {
    const verdicts = run(pageHtml({}), regionSeo({ canonical: null }))
    expect(verdicts.canonical?.status).toBe('pass')
  })

  it('fails a page with no structured data', () => {
    expect(run(pageHtml({ jsonLd: false }))['json-ld']?.status).toBe('fail')
  })

  it('fails a page whose crawlable children never arrived', () => {
    const verdicts = run(pageHtml({ body: '<h1>Free meditation classes in Ontario</h1>' }))
    expect(verdicts.body?.status).toBe('fail')
    expect(verdicts.body?.detail).toContain('Thursday class')
  })
})

describe('siteListsUrl', () => {
  const answering = (pages: Record<string, string>) => async (url: string) =>
    ({
      ok: url in pages,
      status: url in pages ? 200 : 404,
      body: pages[url] ?? '',
    }) satisfies FetchedPage

  it('finds the page through a Sitemap: line in robots.txt', async () => {
    const verdict = await siteListsUrl({
      origin: 'https://sahajayoga.ca',
      target: PAGE_URL,
      fetchFn: answering({
        'https://sahajayoga.ca/robots.txt': 'Sitemap: https://sahajayoga.ca/wp-sitemap.xml',
        'https://sahajayoga.ca/wp-sitemap.xml': `<urlset><url><loc>${PAGE_URL}</loc></url></urlset>`,
      }),
    })
    expect(verdict.status).toBe('pass')
  })

  it('tries /sitemap.xml even when robots.txt declares nothing', async () => {
    // A site that publishes the file and forgets the line is the common case.
    const verdict = await siteListsUrl({
      origin: 'https://sahajayoga.ca',
      target: PAGE_URL,
      fetchFn: answering({
        'https://sahajayoga.ca/sitemap.xml': `<urlset><url><loc>${PAGE_URL}</loc></url></urlset>`,
      }),
    })
    expect(verdict.status).toBe('pass')
  })

  it('follows one level of sitemap index', async () => {
    const verdict = await siteListsUrl({
      origin: 'https://sahajayoga.ca',
      target: PAGE_URL,
      fetchFn: answering({
        'https://sahajayoga.ca/sitemap.xml':
          '<sitemapindex><sitemap><loc>https://sahajayoga.ca/sitemap-1.xml</loc></sitemap></sitemapindex>',
        'https://sahajayoga.ca/sitemap-1.xml': `<urlset><url><loc>${PAGE_URL}</loc></url></urlset>`,
      }),
    })
    expect(verdict.status).toBe('pass')
  })

  it('fails when a reachable sitemap does not list the page', async () => {
    const verdict = await siteListsUrl({
      origin: 'https://sahajayoga.ca',
      target: PAGE_URL,
      fetchFn: answering({
        'https://sahajayoga.ca/sitemap.xml':
          '<urlset><url><loc>https://sahajayoga.ca/about</loc></url></urlset>',
      }),
    })
    expect(verdict.status).toBe('fail')
    expect(verdict.detail).toContain(PAGE_URL)
  })

  it('refuses a Sitemap: line pointing off the host under check', async () => {
    // The SSRF bound. Whoever controls that site's robots.txt chose this URL,
    // and the verdict difference between "answered" and "did not" is a
    // reachability oracle for the network this process sits in.
    const asked: string[] = []
    const verdict = await siteListsUrl({
      origin: 'https://sahajayoga.ca',
      target: PAGE_URL,
      fetchFn: async (url) => {
        asked.push(url)
        return {
          ok: url.endsWith('/robots.txt'),
          status: 200,
          url,
          body: 'Sitemap: http://169.254.169.254/latest/meta-data/',
        }
      },
    })
    expect(asked).not.toContain('http://169.254.169.254/latest/meta-data/')
    expect(verdict.status).toBe('skipped')
  })

  it('refuses a sitemap index child pointing off the host', async () => {
    const asked: string[] = []
    await siteListsUrl({
      origin: 'https://sahajayoga.ca',
      target: PAGE_URL,
      fetchFn: async (url) => {
        asked.push(url)
        return {
          ok: url === 'https://sahajayoga.ca/sitemap.xml',
          status: 200,
          url,
          body:
            '<sitemapindex><sitemap><loc>http://10.0.0.5:8080/</loc></sitemap>' +
            '<sitemap><loc>file:///etc/passwd</loc></sitemap></sitemapindex>',
        }
      },
    })
    expect(asked).not.toContain('http://10.0.0.5:8080/')
    expect(asked).not.toContain('file:///etc/passwd')
  })

  it('skips rather than fails when no sitemap could be reached', async () => {
    // We could not look. Not evidence the install is wrong.
    const verdict = await siteListsUrl({
      origin: 'https://sahajayoga.ca',
      target: PAGE_URL,
      fetchFn: answering({}),
    })
    expect(verdict.status).toBe('skipped')
  })
})

describe('fetchPage bounds a third party\u2019s redirect', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * One scripted answer per URL, recording every URL the process asked for.
   *
   * ⚠ It honours `redirect`, because that is the behaviour under test: on
   * `follow` the platform issues the request to the `Location` itself, and a
   * stub that answered the 3xx instead would make the hole invisible.
   */
  const serving = (answers: Record<string, Response>) => {
    const asked: string[] = []
    const answerFor = async (url: string, mode: RequestRedirect): Promise<Response> => {
      asked.push(url)
      const answer = answers[url]
      if (!answer) throw new Error(`unexpected fetch: ${url}`)
      const location = answer.headers.get('location')
      if (mode !== 'follow' || !location) return answer
      return answerFor(new URL(location, url).href, mode)
    }
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
      answerFor(String(input), init?.redirect ?? 'follow'),
    )
    return asked
  }

  const redirectTo = (location: string) =>
    new Response(null, { status: 302, headers: { location } })

  it('never issues the request a sitemap line redirects to off-host', async () => {
    const asked = serving({
      'https://sahajayoga.ca/sitemap.xml': redirectTo('http://169.254.169.254/latest/meta-data/'),
    })

    const page = await fetchPage('https://sahajayoga.ca/sitemap.xml', {
      sameHost: 'sahajayoga.ca',
    })

    expect(page.ok).toBe(false)
    expect(page.detail).toBe(OFF_HOST)
    // The whole point: the internal address is absent, not merely discarded.
    expect(asked).toEqual(['https://sahajayoga.ca/sitemap.xml'])
  })

  it('still follows a redirect that stays on the host under check', async () => {
    // http \u2192 https and a trailing slash are ordinary, and refusing them
    // would report a working site as publishing no sitemap.
    const asked = serving({
      'https://sahajayoga.ca/sitemap.xml': redirectTo('/sitemap_index.xml'),
      'https://sahajayoga.ca/sitemap_index.xml': new Response('<urlset></urlset>', { status: 200 }),
    })

    const page = await fetchPage('https://sahajayoga.ca/sitemap.xml', {
      sameHost: 'sahajayoga.ca',
    })

    expect(page.ok).toBe(true)
    expect(page.body).toContain('<urlset>')
    expect(asked).toHaveLength(2)
  })
})

describe('the stored detail is bounded', () => {
  it('truncates a detail that quotes the remote page', async () => {
    // A failing title check embeds whatever that host put in <title>, and the
    // result is stored on the row, re-read on every tab load, and emailed.
    const verdicts = comparePage({
      seo: regionSeo(),
      snapshot: parsePageHtml(pageHtml({ title: 'x'.repeat(5000) })),
      pageUrl: PAGE_URL,
    })
    expect(verdicts.title?.status).toBe('fail')
    expect(verdicts.title?.detail?.length).toBeLessThanOrEqual(300)
  })
})

describe('sampleRegion', () => {
  const url = (route: string): AtlasSitemapUrl => ({
    loc: `https://sahajayoga.ca/classes${route}`,
    lastmod: '2026-10-01T00:00:00.000Z',
    route,
  })

  it('takes the shallowest region, which is the most linked page', () => {
    expect(sampleRegion([url('/ca/ontario/toronto'), url('/ca')])?.route).toBe('/ca')
  })

  it('never takes a class, which has no listing to look for', () => {
    expect(sampleRegion([url('/ca/ontario/1204'), url('/ca/ontario')])?.route).toBe('/ca/ontario')
  })

  it('is null for a client owning nothing publishable', () => {
    expect(sampleRegion([])).toBeNull()
  })
})

describe('runSeoChecks', () => {
  const VERIFIED = {
    domain: 'sahajayoga.ca',
    mount: '/classes',
    widgetVersion: 3,
    at: '2026-10-01T00:00:00.000Z',
  }

  const resolvers = {
    resolveSeo: async (route: string) =>
      route === '/'
        ? ({
            ...regionSeo(),
            type: 'root',
            id: null,
            route: '/',
            content: { paragraphs: ['Come and sit.'] },
          } as unknown as AtlasSeoDocument)
        : regionSeo(),
    resolveSitemap: async () => [
      { loc: PAGE_URL, lastmod: '2026-10-01T00:00:00.000Z', route: '/ca/ontario' },
    ],
  }

  it('fails every page check when the mount redirects off-host', async () => {
    // Two of comparePage's failures quote what came back, so following the hop
    // would put another host's title and canonical in the manager's warning
    // mail. A redirecting mount is also a real answer, not "we could not look".
    const results = await runSeoChecks({
      verified: VERIFIED,
      routing: 'path',
      resolvers,
      deps: {
        fetchFn: async () => ({ ok: false, status: 302, body: '', detail: OFF_HOST }),
      },
    })

    const pages = results.filter((result) => result.check !== 'sitemap')
    expect(pages.length).toBeGreaterThan(0)
    for (const result of pages) {
      expect(result.status).toBe('fail')
      expect(result.detail).toContain('redirects to another site')
    }
  })

  it('checks the root and one sampled region, and the sitemap once', async () => {
    const results = await runSeoChecks({
      verified: VERIFIED,
      routing: 'path',
      resolvers,
      deps: {
        fetchFn: async (url) => ({
          ok: true,
          status: 200,
          body: url.includes('/robots.txt')
            ? `Sitemap: https://sahajayoga.ca/sitemap.xml`
            : url.includes('sitemap.xml')
              ? `<urlset><url><loc>${PAGE_URL}</loc></url></urlset>`
              : pageHtml({
                  title: url === PAGE_URL ? 'Free meditation classes in Ontario' : 'Ontario',
                  canonical: url === PAGE_URL ? PAGE_URL : 'https://sahajayoga.ca/classes',
                  body: url === PAGE_URL ? '<li>Thursday class</li>' : '<p>Come and sit.</p>',
                }),
        }),
      },
    })

    expect(results.map((result) => result.route)).toContain('/')
    expect(results.map((result) => result.route)).toContain('/ca/ontario')
    // The sitemap runs on the sampled region alone: a site lists its own mount
    // for reasons that have nothing to do with us.
    expect(results.filter((result) => result.check === 'sitemap')).toHaveLength(1)
    expect(results.find((result) => result.check === 'sitemap')?.route).toBe('/ca/ontario')
  })

  it('skips every check on a page it could not fetch, rather than failing it', async () => {
    const results = await runSeoChecks({
      verified: VERIFIED,
      routing: 'path',
      resolvers,
      deps: { fetchFn: async () => ({ ok: false, status: 503, body: '', detail: 'timed out' }) },
    })
    expect(results.every((result) => result.status === 'skipped')).toBe(true)
  })
})

describe('nextSeoCheckState', () => {
  const failure = (route: string, check: SeoCheckResult['check']): SeoCheckResult => ({
    route,
    check,
    status: 'fail',
  })

  it('never touches failureCount, which would withdraw working URLs', () => {
    const folded = nextSeoCheckState({
      current: { ...EMPTY_VERIFICATION, failureCount: 1 },
      results: [failure('/', 'title')],
      now: new Date('2026-11-01T00:00:00Z'),
    })
    expect(folded.verification.failureCount).toBe(1)
  })

  it('leaves the siblings it does not own exactly as they were', () => {
    const current = {
      ...EMPTY_VERIFICATION,
      verified: {
        domain: 'sahajayoga.ca',
        mount: '/classes',
        widgetVersion: 3,
        at: '2026-10-01T00:00:00.000Z',
      },
      routingProbe: { at: '2026-10-01T00:00:00.000Z', verdict: 'path' as const, failedAttempts: 0 },
    }
    const folded = nextSeoCheckState({
      current,
      results: [],
      now: new Date('2026-11-01T00:00:00Z'),
    })
    expect(folded.verification.verified).toEqual(current.verified)
    expect(folded.verification.routingProbe).toEqual(current.routingProbe)
  })

  it('reports a failure nobody has been told about', () => {
    const folded = nextSeoCheckState({
      current: EMPTY_VERIFICATION,
      results: [failure('/', 'title')],
      now: new Date('2026-11-01T00:00:00Z'),
    })
    expect(folded.newFailures.map(seoFailureKey)).toEqual(['/#title'])
  })

  it('stays quiet about a failure already reported', () => {
    const first = nextSeoCheckState({
      current: EMPTY_VERIFICATION,
      results: [failure('/', 'title')],
      now: new Date('2026-11-01T00:00:00Z'),
    })
    const second = nextSeoCheckState({
      current: first.verification,
      results: [failure('/', 'title')],
      now: new Date('2026-11-02T00:00:00Z'),
    })
    expect(second.newFailures).toEqual([])
  })

  it('reports it again after it was fixed and broke again', () => {
    const broken = nextSeoCheckState({
      current: EMPTY_VERIFICATION,
      results: [failure('/', 'title')],
      now: new Date('2026-11-01T00:00:00Z'),
    })
    const fixed = nextSeoCheckState({
      current: broken.verification,
      results: [{ route: '/', check: 'title', status: 'pass' }],
      now: new Date('2026-11-02T00:00:00Z'),
    })
    const again = nextSeoCheckState({
      current: fixed.verification,
      results: [failure('/', 'title')],
      now: new Date('2026-11-03T00:00:00Z'),
    })
    expect(again.newFailures.map(seoFailureKey)).toEqual(['/#title'])
  })

  it('tells the same check on two pages apart', () => {
    const folded = nextSeoCheckState({
      current: EMPTY_VERIFICATION,
      results: [failure('/', 'title'), failure('/ca', 'title')],
      now: new Date('2026-11-01T00:00:00Z'),
    })
    expect(folded.newFailures.map(seoFailureKey)).toEqual(['/#title', '/ca#title'])
  })
})
