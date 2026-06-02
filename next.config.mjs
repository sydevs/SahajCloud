import { withPayload } from '@payloadcms/next/withPayload'

// Sentry integration uses @sentry/cloudflare for Cloudflare Workers compatibility
// See: instrumentation.ts and sentry.edge.config.ts for configuration

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Cloudflare Workers deployment via OpenNext
  output: 'standalone',
  experimental: {
    // Serialize "Collecting page data" / static generation to a single worker.
    //
    // With the default (cpus - 1) workers, each static-worker imports the
    // route graph → @payload-config → the Cloudflare binding layer, which
    // boots a miniflare/workerd runtime. @sentry/cloudflare registers a
    // SQLite-backed `SENTRY_DO` Durable Object, so N concurrent workerd
    // instances open the same local .wrangler SQLite state and collide with
    // `SQLITE_BUSY` ("The Workers runtime failed to start"), failing the
    // build non-deterministically (e.g. on /api/openapi.json).
    //
    // One worker = one SQLite handle at a time = no contention. Costs some
    // build wall-clock; this app is mostly dynamic routes so the hit is small.
    cpus: 1,
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
    unoptimized: true, // Required for Cloudflare Workers
  },
  // External packages for server-side rendering (required for Cloudflare Workers)
  serverExternalPackages: [
    'payload',
    '@payloadcms/db-d1-sqlite',
    '@payloadcms/db-sqlite',
    '@libsql/client',
    '@libsql/isomorphic-ws', // Required for Cloudflare Workers build
    'better-sqlite3',
    'jose', // JWT library used by PayloadCMS
  ],
}

// Apply Payload config and export
export default withPayload(nextConfig, { devBundleServerPackages: false })
