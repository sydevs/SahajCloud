#!/usr/bin/env node
/**
 * Exercise the Cloudflare Browser Rendering integration against real pages.
 *
 * Everything about embed verification is unit-tested with the render stubbed, which is right for
 * the test lane but leaves the integration itself — request shape, auth, and how Cloudflare's
 * errors map onto our vocabulary — unproven until it runs. This is that proof, and a diagnostic
 * for later: when a service's canonical ownership is disabled and nobody believes it, run the URL
 * through here and read what the CMS actually saw.
 *
 * It calls the same `verifyEmbed()` the nightly job calls, so a green run here is evidence about
 * production and not about a mock.
 *
 * Usage:
 *   pnpm tsx scripts/verify-embed-live.ts --self-test        # all four outcomes, no live site needed
 *   pnpm tsx scripts/verify-embed-live.ts https://sahajayoga.nl/locatelessons/
 *
 * Env: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_KEY (the token needs Browser Rendering).
 * Costs one Browser Rendering call per URL — it is a real render, not a fetch.
 */
import dotenv from 'dotenv'

/** The marker contract from sydevs/SahajAtlasWeb `src/lib/readiness.ts`. */
const MARKER = { v: 2, routing: 'query', topLevel: true, urlWritable: true }

/**
 * A `data:` page that writes the marker from JS *after* load, the way the widget does.
 *
 * Cloudflare navigates `data:` URLs, so the success path is provable without hosting anything or
 * waiting on a customer site to upgrade — and it is a fair test precisely because the marker is not
 * in the served markup: `waitForSelector` has to observe the script writing it.
 */
function markerPage(marker: Record<string, unknown> | null): string {
  const write = marker
    ? `<script>setTimeout(function(){document.documentElement.setAttribute(
        'data-sahaj-atlas-ready', JSON.stringify(${JSON.stringify(marker)}))},300)</script>`
    : ''
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><html><head><title>probe</title></head><body>probe${write}</body></html>`,
  )}`
}

async function main(): Promise<void> {
  dotenv.config({ path: ['.env.local', '.env'] })

  // Imported after dotenv: these modules read `serverEnv`, which validates on access.
  const { verifyEmbed, resultFromRender } = await import(
    '../src/lib/embedVerification/verifyEmbed'
  )
  const { renderPage } = await import('../src/lib/embedVerification/browserRendering')
  const { READY_ATTR } = await import('../src/lib/embedVerification/readinessMarker')

  /**
   * The success case goes one level below `verifyEmbed`, deliberately.
   *
   * `verifyEmbed` refuses any non-http(s) mount before rendering — correct, since that guard is
   * what keeps `data:` and `file:` out of the browser — so the probe page has to enter through
   * `renderPage`. Every layer that matters is still real: the live render, the entity-decoded
   * marker, and the classification. Only the one-line scheme guard is bypassed, and it has its own
   * unit test.
   */
  const verifyProbePage = async (url: string) =>
    resultFromRender(url, await renderPage(url, `[${READY_ATTR}]`))

  const args = process.argv.slice(2)
  const selfTest = args.includes('--self-test')

  const cases: { label: string; url: string; expect: string }[] = selfTest
    ? [
        { label: 'widget present', url: markerPage(MARKER), expect: 'verified' },
        { label: 'no widget on the page', url: markerPage(null), expect: 'failed/marker-absent' },
        {
          label: 'dead domain',
          url: 'https://this-domain-does-not-exist-sahaj-9182.example/',
          expect: 'failed/dns',
        },
        { label: 'unparseable mount', url: 'not-a-url', expect: 'failed/http' },
      ]
    : args
        .filter((a) => !a.startsWith('--'))
        .map((url) => ({ label: url, url, expect: '(live)' }))

  if (cases.length === 0) {
    console.error('Pass one or more URLs, or --self-test.')
    process.exit(1)
  }

  let mismatches = 0

  for (const testCase of cases) {
    const started = Date.now()
    const result = testCase.url.startsWith('data:')
      ? await verifyProbePage(testCase.url)
      : await verifyEmbed(testCase.url)
    const elapsed = `${((Date.now() - started) / 1000).toFixed(1)}s`

    const outcome =
      result.status === 'verified' ? 'verified' : `${result.status}/${result.reason}`
    const ok = testCase.expect === '(live)' || outcome === testCase.expect
    if (!ok) mismatches++

    console.log(`${ok ? '✓' : '✗'} ${testCase.label}  →  ${outcome}  (${elapsed})`)
    if (result.status === 'verified') {
      const { domain, mount, routing, widgetVersion } = result.embed
      console.log(`    domain=${domain} mount=${mount} routing=${routing} v=${widgetVersion}`)
    } else if (result.detail) {
      console.log(`    ${result.detail}`)
    }
    if (!ok) console.log(`    expected ${testCase.expect}`)
  }

  if (mismatches > 0) {
    console.error(`\n${mismatches} case(s) did not classify as expected.`)
    process.exit(1)
  }
  console.log('\nAll cases classified as expected.')
  process.exit(0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
