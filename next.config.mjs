import { withPayload } from '@payloadcms/next/withPayload'
import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted output: bundle only traced production deps + a minimal server
  // into `.next/standalone` instead of shipping the full `node_modules`. Railpack
  // runs `pnpm build`, then `scripts/standalone-postbuild.mjs` copies `.next/static`
  // and `public/` next to `server.js` (Next does not copy these automatically).
  // Migrations (`prodMigrations`) and the admin `importMap.js` are statically
  // imported, so they trace into the bundle and still run on boot. See issue #471.
  output: 'standalone',
  // Keep dev-only and test artifacts out of the standalone trace. Next/Turbopack
  // otherwise copies these (large) project dirs into `.next/standalone` — a local
  // `pnpm build` balloons to many GB via `media/` + `seeds/`. Prod stores uploads
  // in R2 (not local `media/`) and never runs seeds/tests, so excluding them is
  // safe — same intent as `.railwayignore` (drop dev-only/test artifacts), via a
  // different mechanism (build trace vs. upload filter). See issue #471.
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
  // Your Next.js config here
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  // Configure CSP headers for Fathom Analytics and Live Preview iframes
  async headers() {
    // Build frame-src dynamically from environment variables with fallbacks
    // `headers()` is evaluated at BUILD time. Railway exposes all service variables
    // to the build, so this reads the real WEMEDITATE_WEB_URL / SAHAJATLAS_URL and
    // the build-time frame-src matches the runtime `livePreview.url` (otherwise the
    // browser CSP-blocks the preview iframe). The literals are local/CI fallbacks.
    const frameSources = [
      "'self'",
      'https://app.usefathom.com',
      process.env.WEMEDITATE_WEB_URL || 'https://wemeditate.com',
      process.env.SAHAJATLAS_URL || 'https://atlas.sydevelopers.com',
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
    // Next image optimization runs on the Node server (via sharp); Cloudflare
    // caches the optimized output at the edge.
  },
  // External packages for server-side rendering
  serverExternalPackages: ['payload', 'jose'],
}

const configWithPayload = withPayload(nextConfig, { devBundleServerPackages: false })

// Wrap with Sentry. Source maps are only uploaded when SENTRY_AUTH_TOKEN (+ org
// / project) are configured (CI / Railway); otherwise the build proceeds without
// upload. `silent` keeps local builds quiet.
export default withSentryConfig(configWithPayload, {
  silent: !process.env.CI,
})
