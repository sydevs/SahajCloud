/**
 * Wait for the PR preview's boot-time fixture load to finish (#1168).
 *
 * Runs in `ci.yml` after `get-railway-preview-url.ts` has confirmed the preview
 * serves this PR's head commit. Polls the Railway host's `/api/health` — the one
 * path the preview gate exempts, so no credential — until `fixture` is
 * `loaded`, and exits non-zero on any other ending, with an `::error` naming it.
 *
 * Env:
 *   PREVIEW_URL - the Railway preview host, as discovery exported it
 */
import { FIXTURE_ERRORS, pollFixture } from './railway-preview-status'

const PREVIEW_URL = process.env.PREVIEW_URL
const TIMEOUT_MS = 10 * 60_000
const POLL_INTERVAL_MS = 10_000

async function main(): Promise<void> {
  if (!PREVIEW_URL) throw new Error('PREVIEW_URL is not set')
  const outcome = await pollFixture({
    fetchHealth: async () => {
      const res = await fetch(`${PREVIEW_URL}/api/health`, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    timeoutMs: TIMEOUT_MS,
    pollIntervalMs: POLL_INTERVAL_MS,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: Date.now,
    log: console.error,
  })
  if (outcome !== 'loaded') {
    console.error(FIXTURE_ERRORS[outcome])
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
