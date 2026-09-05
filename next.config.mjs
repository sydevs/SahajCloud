import { withPayload } from '@payloadcms/next/withPayload'
import { withSentryConfig } from '@sentry/nextjs'

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
    // Build `frame-src` from environment variables, with fallback values.
    // Next.js runs `headers()` at build time. Railway exposes every service
    // variable to the build, so this step reads the real WEMEDITATE_WEB_URL
    // and SAHAJATLAS_URL values. This keeps the build-time frame-src in
    // sync with the runtime `livePreview.url`. Without this, the browser
    // blocks the preview iframe under CSP. The literal URLs below are
    // fallbacks for local and CI runs.
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
    // Next.js runs image optimization on the Node server, using sharp.
    // Cloudflare caches the optimized output at the edge.
  },
  // External packages for server-side rendering
  serverExternalPackages: ['payload', 'jose'],
}

const configWithPayload = withPayload(nextConfig, { devBundleServerPackages: false })

// Wrap the config with Sentry. Sentry uploads source maps only when
// SENTRY_AUTH_TOKEN and the org and project settings are set, in CI or on
// Railway. Otherwise the build skips the upload. `silent` keeps local
// builds quiet.
export default withSentryConfig(configWithPayload, {
  silent: !process.env.CI,
})
