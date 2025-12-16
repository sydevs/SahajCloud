import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import 'dotenv/config'

/**
 * Playwright E2E Test Configuration
 *
 * Key features:
 * - Uses isolated file-based SQLite database (not dev D1)
 * - Global setup seeds default manager and test data
 * - Tests run against a dedicated E2E dev server
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Global setup/teardown for database initialization and cleanup */
  globalSetup: './tests/setup/playwright.global-setup.ts',
  globalTeardown: './tests/setup/playwright.global-teardown.ts',
  /* Increase timeout for E2E tests that require server startup and login */
  timeout: 60000, // 60 seconds per test
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:4567',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    /* Start dev server with E2E_TEST=true to use isolated SQLite database */
    command: 'E2E_TEST=true PORT=4567 pnpm dev',
    reuseExistingServer: !process.env.CI, // Don't reuse in CI for clean state
    url: 'http://localhost:4567',
    timeout: 120000, // 2 minutes for dev server to start
    env: {
      E2E_TEST: 'true',
      PORT: '4567',
      PAYLOAD_SECRET: 'e2e-test-secret-key',
    },
  },
})
