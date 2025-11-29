import { withPayload } from '@payloadcms/next/withPayload'

// Sentry integration temporarily disabled for Cloudflare Workers compatibility
// The @sentry/nextjs package causes bundling incompatibilities with OpenNext/Cloudflare Workers
// TODO: Investigate Cloudflare Workers-compatible Sentry integration in Phase 6
// Previous Sentry config can be found in git history if needed

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
      ...(process.env.PUBLIC_ASSETS_URL
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
