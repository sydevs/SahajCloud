import { withPayload } from '@payloadcms/next/withPayload'
import { withSentryConfig } from '@sentry/nextjs'

/**
 * The public host a Railway PR preview is served at, or `null` off a preview.
 *
 * ⚠ **Every Server Action on a preview needs this.** The Cloudflare Worker
 * reaches Railway under Railway's own host, so Next sees `x-forwarded-host:
 * <app>.up.railway.app` against `Origin: pr-<n>.cloud-preview…` and aborts the
 * action as cross-site — a 500 on the sign-in picker, and on every admin save.
 * Only this PR's host, and only on a preview build: production listing a
 * same-site preview origin would let unmerged code post as a production user.
 *
 * ⚠ Repeats `PREVIEW_ENVIRONMENT_NAME` and `PREVIEW_DOMAIN_SUFFIX`
 * (`src/lib/preview/proxy.ts`), which a `.mjs` config cannot import.
 * `tests/unit/next-config-server-actions.spec.ts` asserts they agree.
 */
export function previewPublicHost(environmentName) {
  const pr = /^(?:SahajCloud-)?pr-(\d+)$/.exec(environmentName?.trim() ?? '')?.[1]
  return pr ? `pr-${pr}.cloud-preview.sydevelopers.com` : null
}

const previewHost = previewPublicHost(
  process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_ENVIRONMENT,
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted build: bundle only the traced production files and a small
  // server into `.next/standalone`. This skips shipping the full
  // `node_modules`. Railpack runs `pnpm build`, then
  // `scripts/standalone-postbuild.mjs` copies `.next/static` and `public/`
  // next to `server.js`, since Next does not copy these files on its own.
  // Migrations (`prodMigrations`) and the admin `importMap.js` are static
  // imports, so they trace into the bundle and still run at boot. See
  // issue #471.
  output: 'standalone',
  // ⚠ One `experimental` key only. A second literal silently replaces this
  // one, and both flags below fail open — an unset cap truncates at 10 MB, an
  // unset Turbopack flag restores the corrupt store.
  experimental: {
    // `src/middleware.ts` matches every path but static assets, so Next
    // buffers a copy of every request body and silently truncates it at this
    // cap. Payload then reads a cut-off upload and throws "Unexpected end of
    // form" (#938). The matcher widened for the preview gate, so this cap now
    // bounds pre-auth memory on every route rather than on `/api` alone.
    //
    // ⚠ Keep this STRICTLY above `upload.requestSizeLimit` in
    // `src/payload.config.ts`. Payload refuses a body only once it exceeds
    // that limit, so at an equal cap the truncation lands first: its 413 is
    // unreachable, and the request ends mid-form as an opaque 500 instead
    // (#938, #939). The headroom is pre-auth memory, held twice, by anyone,
    // so keep it small.
    // `tests/unit/next-config-body-limit.spec.ts` pins the ordering.
    proxyClientMaxBodySize: 53477376, // 51MB, in bytes — upload.requestSizeLimit + 1MB
    // Railpack restores `.next/cache`, so a store corrupted there panics
    // every later build. Dev's store is elsewhere. #932
    turbopackFileSystemCacheForBuild: false,
    // Read at build time, which Railway runs per environment — see
    // `previewPublicHost` above.
    ...(previewHost ? { serverActions: { allowedOrigins: [previewHost] } } : {}),
  },
  // Keep dev and test files out of the standalone trace. Otherwise Next
  // copies these large directories into `.next/standalone`, and a local
  // `pnpm build` grows to many GB from `media/` and `seeds/`. Production
  // stores uploads in R2, not local `media/`, and never runs seeds or
  // tests, so excluding them here is safe. `.railwayignore` drops the same
  // kind of files through a different mechanism: it filters uploads, not
  // the build trace. See issue #471.
  outputFileTracingExcludes: {
    '*': [
      'media/**/*',
      'seeds/**/*',
      'tests/**/*',
      'playwright-report/**/*',
      'test-results/**/*',
      'coverage/**/*',
    ],
  },
  // Configure CSP headers for Fathom Analytics and Live Preview iframes
  async headers() {
    // Build `frame-src` from environment variables, with fallback values.
    // Next.js runs `headers()` at build time. Railway exposes every service
    // variable to the build, so this step reads the real WEMEDITATE_WEB_URL
    // and SAHAJATLAS_URL values. This keeps the build-time frame-src in
    // sync with the runtime `livePreview.url`. Without this, the browser
    // blocks the preview iframe under CSP.
    //
    // ⚠ The literals below are what a local or CI build uses, and they must
    // stay equal to the production values in `.env.example`. A wrong one is
    // invisible: the build succeeds and the panel is simply blank.
    // `tests/unit/csp-frame-src.spec.ts` pins them.
    //
    // ⚠ This policy reaches every document served here, `GET /api/atlas/challenge` included,
    // and that page frames Cloudflare's Turnstile. A route cannot override it either: Next drops
    // a route's own `Content-Security-Policy` once config has set one
    // (`next/dist/server/send-response.js`), so Cloudflare's origin has to be listed here.
    const frameSources = [
      "'self'",
      'https://app.usefathom.com',
      'https://challenges.cloudflare.com',
      process.env.WEMEDITATE_WEB_URL || 'https://wemeditate.com',
      process.env.SAHAJATLAS_URL || 'https://sahajatlas.com',
    ].join(' ')

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `frame-src ${frameSources};`,
          },
        ],
      },
      {
        // The sign-in view (`src/components/admin/SignIn`) is where every
        // emailed link lands, with its credential in the query string — so no
        // onward request may carry that URL along as a `Referer`.
        source: '/admin/login',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ]
  },
  images: {
    remotePatterns: [
      ...(process.env.CLOUDFLARE_R2_DELIVERY_URL
        ? [
            {
              protocol: 'https',
              hostname: new URL(process.env.CLOUDFLARE_R2_DELIVERY_URL).hostname,
            },
          ]
        : []),
      {
        protocol: 'https',
        hostname: '**.cloudflarestream.com', // For Stream thumbnails (issue #70)
      },
      {
        protocol: 'https',
        hostname: 'img.shields.io', // For status badges (issue #100)
      },
    ],
    // Next.js runs image optimization on the Node server, using sharp.
    // Cloudflare caches the optimized output at the edge.
  },
  // Publish the deployment name to the browser bundle, which reads no
  // environment at runtime. Next inlines every `env` key here as
  // `process.env.<KEY>`. Why this needs no dashboard variable, and why a
  // build-time value is the right shape:
  // `docs/environment.md` → NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT.
  //
  // ⚠ This chain repeats `deploymentEnvironment()`
  // (`src/lib/env/deploymentEnvironment.ts`) verbatim, because a `.mjs`
  // config cannot import it. Keep the two identical:
  // `tests/unit/client-deployment-environment.spec.ts` imports this file and
  // asserts they agree. See #737.
  env: {
    NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT:
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      process.env.RAILWAY_ENVIRONMENT ??
      process.env.NODE_ENV,
  },
  // External packages for server-side rendering
  serverExternalPackages: ['payload', 'jose'],
}

const configWithPayload = withPayload(nextConfig, { devBundleServerPackages: false })

// Wrap the config with Sentry. Sentry uploads source maps only when
// SENTRY_AUTH_TOKEN and the org and project settings are set, in CI or on
// Railway. Otherwise the build skips the upload. `silent` keeps local
// builds quiet.
//
// ⚠ A Railway build sets no CI, so `silent: !CI` alone also hid the
// skipped-upload notice on the one build whose source maps ship. #877 untracked
// the token, leaving the dashboard its only source, so a missing one has to
// reach the deploy log.
const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT)

export default withSentryConfig(configWithPayload, {
  silent: !process.env.CI && !onRailway,
})
