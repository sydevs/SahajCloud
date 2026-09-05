#!/usr/bin/env node
const { execSync } = require('child_process')

// Local e2e runs are the only place that needs the Playwright browser
// download. Skip it in build and deploy environments. Railway sets its
// RAILWAY_* variables during both build and deploy, so check for those
// directly instead of relying on a generic CI flag. Other CI providers,
// such as GitHub Actions, set the CI variable instead.
const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID)
const isCI =
  process.env.CI === 'true' ||
  process.env.CI === '1' ||
  process.env.GITHUB_ACTIONS === 'true' ||
  process.env.SKIP_POSTINSTALL === 'true'

if (isRailway || isCI) {
  console.log(`[postinstall] Skipping Playwright (${isRailway ? 'Railway' : 'CI'} environment)`)
  process.exit(0)
}

try {
  console.log('[postinstall] Installing Playwright browsers...')
  execSync('npx playwright install chromium', { stdio: 'inherit' })
} catch (error) {
  console.warn('[postinstall] Playwright install failed (non-fatal)')
  console.warn('Run manually: npx playwright install chromium')
  process.exit(0)
}
