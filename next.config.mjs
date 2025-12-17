import { withPayload } from '@payloadcms/next/withPayload'

// Sentry integration uses @sentry/cloudflare for Cloudflare Workers compatibility
// See: instrumentation.ts and sentry.edge.config.ts for configuration

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Cloudflare Workers deployment via OpenNext
  output: 'standalone',
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
