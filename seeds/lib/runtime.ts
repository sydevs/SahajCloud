/**
 * Runtime Detection Utilities
 *
 * Detects execution environment to enable dual-mode operation:
 * - Local development: File caching in `seeds/cache/`
 * - Cloudflare Workers: Streaming without disk
 */

/**
 * Check if running in Cloudflare Workers environment
 *
 * Detection methods (in order of reliability):
 * 1. CF_PAGES: Set when running on Cloudflare Pages
 * 2. Environment check: Not browser (no document) + has caches API
 */
export function isCloudflareWorker(): boolean {
  // CF_PAGES is set in Cloudflare Pages environment (most reliable)
  if (typeof process !== 'undefined' && process.env?.CF_PAGES !== undefined) {
    return true
  }

  // Fallback: Check for Workers-specific combination
  // - Has `caches` global (Workers runtime)
  // - Does NOT have `document` (not a browser)
  // - Does NOT have `window` (not a browser)
  // This prevents false positives during SSR hydration
  if (
    typeof globalThis !== 'undefined' &&
    'caches' in globalThis &&
    !('document' in globalThis) &&
    !('window' in globalThis)
  ) {
    return true
  }

  return false
}

/**
 * Check if running in local development environment
 */
export function isLocalDevelopment(): boolean {
  return !isCloudflareWorker()
}
