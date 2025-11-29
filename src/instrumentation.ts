// Instrumentation file for Next.js
// Sentry is disabled for Cloudflare Workers builds due to bundling incompatibilities
// TODO: Re-enable Sentry after implementing Workers-compatible integration (Phase 6)

export async function register() {
  // Instrumentation currently disabled for all environments
  // Will be re-enabled after Cloudflare Workers compatibility is resolved
  return
}

export async function onRequestError() {
  // No-op - Sentry integration disabled
  return
}
