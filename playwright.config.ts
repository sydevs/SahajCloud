import { defineConfig, devices } from '@playwright/test'

import 'dotenv/config'

import { accessTokenHeaders } from './src/lib/preview/proxy'

const accessHeaders = accessTokenHeaders(
  process.env.CF_ACCESS_CLIENT_ID,
  process.env.CF_ACCESS_CLIENT_SECRET,
)

/**
 * Playwright config for smoke specs that hit a deployed preview environment.
 *
 * CI sets PREVIEW_URL to the PR's fixed preview address
 * (`pr-<n>.cloud-preview.sydevelopers.com`) before invoking `pnpm test:smoke`.
 * Locally, falls back to the dev-server URL on port 3000 (dev-server skill).
 *
 * ⚠ **That address sits behind Cloudflare Access**, so every request carries the
 * `github-ci` service token below. Without it each one is answered with an
 * Access login page — a 302 to `*.cloudflareaccess.com`, not a refusal from this
 * app, which is why `ensureAdmin` names that case in its own error.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.spec.ts',
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // The second reporter turns a skip into a failure whenever PREVIEW_URL is
  // set. See tests/e2e/_helpers/failOnSkipReporter.ts for why a skip must not
  // pass, and tests/AGENTS.md § "Smoke specs" for the lane's rules.
  reporter: [[process.env.CI ? 'github' : 'html'], ['./tests/e2e/_helpers/failOnSkipReporter.ts']],
  use: {
    baseURL: process.env.PREVIEW_URL ?? 'http://localhost:3000',
    // `accessTokenHeaders` omits the pair entirely when either half is unset,
    // rather than sending one blank: Access reads a blank client id as a failed
    // service-token attempt and logs one. The vendor's header names are shared
    // with the seed CLI, which nothing else validates.
    ...(Object.keys(accessHeaders).length > 0 ? { extraHTTPHeaders: accessHeaders } : {}),
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
