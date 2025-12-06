/// <reference types="@cloudflare/workers-types" />

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Payload Core
      PAYLOAD_SECRET: string

      // Database
      DATABASE_URI?: string

      // Cloudflare Services
      CLOUDFLARE_ACCOUNT_ID: string
      CLOUDFLARE_API_KEY?: string // Unified API key for Images + Stream
      CLOUDFLARE_IMAGES_DELIVERY_URL?: string // e.g., "https://imagedelivery.net/<hash>"
      CLOUDFLARE_STREAM_DELIVERY_URL?: string // e.g., "https://customer-<code>.cloudflarestream.com"
      CLOUDFLARE_R2_DELIVERY_URL?: string // e.g., "https://assets.sydevelopers.com"

      // Email
      RESEND_API_KEY?: string
      SMTP_HOST?: string
      SMTP_PORT?: string
      SMTP_USER?: string
      SMTP_PASS?: string
      SMTP_FROM?: string

      // Frontend URLs
      SAHAJCLOUD_URL?: string
      WEMEDITATE_WEB_URL?: string
      SAHAJATLAS_URL?: string

      // Monitoring
      SENTRY_DSN?: string
      SENTRY_AUTH_TOKEN?: string
      NEXT_PUBLIC_SENTRY_DSN?: string
    }
  }

  /**
   * Cloudflare Workers environment bindings
   * Available in production Workers environment
   */
  interface CloudflareEnv {
    D1: D1Database
    R2: R2Bucket
  }

  /**
   * Global Cloudflare env object (available in Workers runtime)
   */
  var env: CloudflareEnv | undefined
}

export {}
