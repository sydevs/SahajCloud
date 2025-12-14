#!/usr/bin/env node
const { execSync } = require('child_process')

// Skip in CI/production environments
const isCI =
  process.env.CI === 'true' ||
  process.env.CI === '1' ||
  process.env.CLOUDFLARE_PAGES === '1' ||
  process.env.GITHUB_ACTIONS === 'true' ||
  process.env.SKIP_POSTINSTALL === 'true'

if (isCI) {
  console.log('[postinstall] Skipping Playwright in CI environment')
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
