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
  images: {
    remotePatterns: [
      ...(process.env.NODE_ENV === 'production' && process.env.PUBLIC_ASSETS_URL
        ? [
            {
              protocol: 'https',
              hostname: process.env.PUBLIC_ASSETS_URL,
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
    'better-sqlite3',
    'jose', // JWT library used by PayloadCMS
  ],
}

// Apply Payload config and export
export default withPayload(nextConfig, { devBundleServerPackages: false })
