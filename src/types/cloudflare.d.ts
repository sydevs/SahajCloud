/// <reference types="@cloudflare/workers-types" />

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Payload Core
      PAYLOAD_SECRET: string
      NEXT_PUBLIC_SERVER_URL?: string

      // Database
      DATABASE_URI?: string

      // Cloudflare
      CLOUDFLARE_ACCOUNT_ID: string
      CLOUDFLARE_STREAM_API_TOKEN?: string

      // Email (SMTP)
      SMTP_HOST?: string
      SMTP_PORT?: string
      SMTP_USER?: string
      SMTP_PASS?: string
      SMTP_FROM?: string

      // Storage (S3-compatible R2)
      S3_ENDPOINT?: string
      S3_ACCESS_KEY_ID?: string
      S3_SECRET_ACCESS_KEY?: string
      S3_BUCKET?: string
      S3_REGION?: string
      S3_PUBLIC_ENDPOINT?: string

      // Frontend URLs
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
