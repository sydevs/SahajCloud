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

/**
 * Safely create a Buffer from an ArrayBuffer.
 * Works around Cloudflare Workers Buffer polyfill issues where
 * Buffer.from(arrayBuffer) can cause "offset argument must be of type number" errors.
 *
 * @param arrayBuffer - The ArrayBuffer to convert
 * @returns A Buffer containing the same data
 */
export function safeBufferFrom(arrayBuffer: ArrayBuffer): Buffer {
  if (isCloudflareWorker()) {
    // In Cloudflare Workers, Buffer.from(arrayBuffer) can cause
    // "offset argument must be of type number" errors.
    // Use manual indexed copy which is the only reliable method.
    const bytes = new Uint8Array(arrayBuffer)
    const cleanBuffer = Buffer.alloc(bytes.length)
    for (let i = 0; i < bytes.length; i++) {
      cleanBuffer[i] = bytes[i]
    }
    return cleanBuffer
  }
  return Buffer.from(arrayBuffer)
}

/**
 * Create a clean Buffer copy that works reliably in Cloudflare Workers.
 * Use this when you already have a Buffer that might have offset issues.
 *
 * The Workers Buffer polyfill has issues with Buffer.from(Uint8Array) and
 * similar patterns. This manual indexed copy is the only reliable method.
 *
 * @param buffer - The Buffer to copy
 * @returns A clean Buffer with no offset issues
 */
export function safeBufferCopy(buffer: Buffer): Buffer {
  if (!isCloudflareWorker()) {
    return buffer
  }
  // Manual indexed copy - the only reliable method in Workers
  const cleanBuffer = Buffer.alloc(buffer.length)
  for (let i = 0; i < buffer.length; i++) {
    cleanBuffer[i] = buffer[i]
  }
  return cleanBuffer
}
