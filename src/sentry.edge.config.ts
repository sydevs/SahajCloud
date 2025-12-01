// This file configures the initialization of Sentry for Cloudflare Workers edge runtime.
// Uses @sentry/cloudflare for Cloudflare Workers compatibility with OpenNext.
// https://docs.sentry.io/platforms/javascript/guides/cloudflare/
//
// NOTE: For Next.js edge runtime with Cloudflare Workers, Sentry initialization
// is handled differently than standard Cloudflare Workers.
// In development, this file is not executed (see instrumentation.ts).
// In production with edge runtime, Sentry should be initialized using withSentry
// wrapper in the actual edge route/middleware handlers.

// This file is intentionally minimal to prevent build errors during development.
// For production edge runtime, initialize Sentry in your edge handlers using:
// import * as Sentry from '@sentry/cloudflare'
// export default Sentry.withSentry(optionsFunction, handler)

console.log('Sentry edge config loaded (production edge runtime only)')

// Export empty object to make this a valid module
export {}
