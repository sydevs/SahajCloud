#!/usr/bin/env node
const { execSync } = require('child_process')

// The Playwright browser download is only needed for local e2e runs — skip it
// in build/deploy environments. Railway exposes its RAILWAY_* variables during
// both build and deploy, so detect the platform explicitly there rather than
// relying on a generic CI flag; CI providers (GitHub Actions, etc.) set CI.
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
