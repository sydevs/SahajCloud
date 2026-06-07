import { withPayload } from '@payloadcms/next/withPayload'
import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
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
