/**
 * Runtime Detection Utilities
 *
 * Detects execution environment to enable dual-mode operation:
 * - Local development: File caching in `imports/cache/`
 * - Cloudflare Workers: Streaming without disk
 */

/**
 * Check if running in Cloudflare Workers environment
 *
 * Detection methods:
 * - CF_PAGES: Set when running on Cloudflare Pages
 * - caches API: Available in Workers but not Node.js
 */
export function isCloudflareWorker(): boolean {
  // CF_PAGES is set in Cloudflare Pages environment
  if (typeof process !== 'undefined' && process.env?.CF_PAGES !== undefined) {
    return true
  }

  // Fallback: Check for Workers-specific API
  // The global `caches` object exists in Workers but not in Node.js
  if (typeof globalThis !== 'undefined' && 'caches' in globalThis) {
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
