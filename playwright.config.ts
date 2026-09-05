import { defineConfig, devices } from '@playwright/test'

import 'dotenv/config'

/**
 * Playwright config for smoke specs that hit a deployed preview environment.
 *
 * CI sets PREVIEW_URL to the per-PR Railway preview URL (a `*.up.railway.app`
 * domain, discovered from Railway's GitHub commit status by
 * `scripts/get-railway-preview-url.ts`) before invoking `pnpm test:smoke`.
 * Locally, falls back to the dev-server URL on port 3000 (dev-server skill).
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.spec.ts',
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: process.env.PREVIEW_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
