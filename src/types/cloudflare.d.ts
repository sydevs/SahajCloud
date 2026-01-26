/**
 * Cloudflare Workers Type Declarations
 *
 * Minimal type declarations for Cloudflare Workers bindings used in this project.
 * These are compatible with the wrangler-generated types in worker-configuration.d.ts.
 *
 * @see https://developers.cloudflare.com/workers/languages/typescript/
 */

declare global {
  // ===========================================================================
  // R2 Storage Types
  // ===========================================================================

  /**
   * R2 object metadata
   */
  interface R2HTTPMetadata {
    contentType?: string
    [key: string]: string | undefined
  }

  interface R2PutOptions {
    httpMetadata?: R2HTTPMetadata
    customMetadata?: Record<string, string>
  }

  interface R2Object {
    body: ReadableStream
    etag: string
    httpMetadata?: R2HTTPMetadata
  }

  /**
   * Cloudflare R2 bucket interface
   * @see https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
   */
  interface R2Bucket {
    put(
      key: string,
      value: ArrayBuffer | Uint8Array | string | ReadableStream | Blob,
      options?: R2PutOptions,
    ): Promise<R2Object | null>
    get(key: string): Promise<R2Object | null>
    delete(key: string | string[]): Promise<void>
    head(key: string): Promise<R2Object | null>
    list(options?: {
      prefix?: string
      limit?: number
      cursor?: string
    }): Promise<{ objects: R2Object[]; truncated: boolean; cursor?: string }>
  }

  // ===========================================================================
  // D1 Database Types
  // ===========================================================================

  /**
   * D1 prepared statement
   */
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement
    run(): Promise<D1Result>
    all<T = unknown>(): Promise<D1Result<T>>
    first<T = unknown>(colName?: string): Promise<T | null>
  }

  interface D1Result<T = unknown> {
    results?: T[]
    success: boolean
    meta: {
      duration: number
      changes: number
      last_row_id: number
    }
  }

  /**
   * Cloudflare D1 database interface
   * @see https://developers.cloudflare.com/d1/build-with-d1/d1-client-api/
   */
  interface D1Database {
    prepare(query: string): D1PreparedStatement
    dump(): Promise<ArrayBuffer>
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
    exec(query: string): Promise<D1Result>
  }

  // ===========================================================================
  // Rate Limiting Types
  // ===========================================================================

  interface RateLimitOptions {
    key: string
  }

  interface RateLimitOutcome {
    success: boolean
  }

  /**
   * Cloudflare Rate Limiting binding
   * @see https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
   */
  interface RateLimit {
    limit(options: RateLimitOptions): Promise<RateLimitOutcome>
  }

  // ===========================================================================
  // Node.js Environment Extensions
  // ===========================================================================

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
      WEMEDITATE_WEB_URL: string
      SAHAJATLAS_URL: string

      // Monitoring
      SENTRY_DSN?: string
      SENTRY_AUTH_TOKEN?: string
      NEXT_PUBLIC_SENTRY_DSN?: string
    }
  }

  // ===========================================================================
  // Cloudflare Environment
  // ===========================================================================

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
