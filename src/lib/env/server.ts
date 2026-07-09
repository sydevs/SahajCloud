/**
 * Server Environment Variable Validation
 *
 * This module provides type-safe server environment variable validation using Zod.
 * Extends client environment with server-only variables (secrets, API keys).
 *
 * **IMPORTANT**: This file should ONLY be imported from server-side code.
 * For client-side code, use `@/lib/env/client` instead.
 *
 * **Usage**:
 * ```typescript
 * import { serverEnv } from '@/lib/env'
 *
 * const secret = serverEnv.PAYLOAD_SECRET
 * const db = serverEnv.DATABASE_URL
 * ```
 */
import { z } from 'zod'

import { ClientEnvSchema } from './client'

/**
 * Server-side environment variables schema
 *
 * These variables are NEVER exposed to the client and include:
 * - Secrets and API keys
 * - Database connection strings
 * - Internal service URLs
 *
 * All client environment variables are also included in the server schema.
 */
const ServerEnvSchema = ClientEnvSchema.extend({
  // ============================================
  // REQUIRED - Core Application
  // ============================================

  /**
   * PayloadCMS encryption secret
   * Must be at least 32 characters for security (AES-256 key strength)
   */
  PAYLOAD_SECRET: z.string().min(32, 'PAYLOAD_SECRET must be at least 32 characters'),

  /**
   * Postgres connection string (Railway Postgres).
   * Consumed by the Payload Postgres adapter in `src/payload.config.ts`.
   * Example: `postgresql://user:password@host:5432/dbname`
   */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Postgres connection string)'),

  /**
   * Max size of the Postgres connection pool (node-postgres `pool.max`).
   * Consumed by the Payload Postgres adapter in `src/payload.config.ts`.
   * Size to the Railway Postgres connection limit divided across running
   * instances — see the pool-sizing notes in `.claude/docs/architecture.md`.
   * Prod (2026-07): Postgres `max_connections=100` (97 usable), 1 app replica →
   * default 20 leaves ample headroom while doubling bulk-publish burst capacity.
   * @default 20
   */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(20),

  /**
   * Enable Drizzle query logging (SQL + params to the console). Opt-in and
   * force-disabled in production — used to capture the query trail behind a
   * slow admin operation in dev/staging. Any truthy string (`true`/`1`) turns
   * it on. Pair with Railway Postgres `log_min_duration_statement` for
   * server-side timings. See `.claude/docs/architecture.md`.
   * @default false
   */
  DB_QUERY_LOGGING: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),

  /**
   * Nirmala Vidya API key for fetching lecture metadata from Vimeo
   * Optional at startup — validated at point of use when creating/refreshing lectures
   */
  NIRMALA_VIDYA_API_KEY: z
    .string()
    .min(20, 'NIRMALA_VIDYA_API_KEY must be at least 20 characters')
    .optional(),

  // ============================================
  // OPTIONAL - Cloudflare media services (Images, Stream) + R2 over S3
  // ============================================
  //
  // Images and Stream stay on Cloudflare (plain HTTPS APIs). R2 is now reached
  // via the S3-compatible API (see `src/plugins/storage`) rather than a Workers
  // binding. When the relevant credentials are unset, storage falls back to
  // local files (development).

  /**
   * Cloudflare Account ID
   * Used for the Images/Stream HTTPS APIs and to derive the R2 S3 endpoint
   * (`https://<accountId>.r2.cloudflarestorage.com`). Optional in development.
   */
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),

  /**
   * Cloudflare API Key (unified token for Images and Stream)
   * Required for the Cloudflare media services in production. Optional in development.
   */
  CLOUDFLARE_API_KEY: z.string().min(20).optional(),

  /**
   * Cloudflare Zone ID for the site's zone. Required (with
   * `CLOUDFLARE_CACHE_PURGE_TOKEN`) to enable edge-cache purge-on-write; unset
   * disables purging and the app relies on the Cache Rule's TTL. See
   * `src/plugins/cache`.
   */
  CLOUDFLARE_ZONE_ID: z.string().optional(),

  /**
   * Cloudflare API token scoped to `Cache Purge` for the zone above. Optional —
   * when unset, edge-cache purge-on-write is a no-op (TTL is the invalidation).
   */
  CLOUDFLARE_CACHE_PURGE_TOKEN: z.string().min(20).optional(),

  /**
   * Cloudflare Images delivery URL
   * Format: https://imagedelivery.net/<hash>
   */
  CLOUDFLARE_IMAGES_DELIVERY_URL: z.url().optional(),

  /**
   * Cloudflare Stream delivery URL
   * Format: https://customer-<code>.cloudflarestream.com
   */
  CLOUDFLARE_STREAM_DELIVERY_URL: z.url().optional(),

  /**
   * R2 public delivery URL (custom domain / CDN in front of the R2 bucket).
   * Delivery domains are unchanged by the S3 migration (e.g. https://assets.sydevelopers.com).
   */
  CLOUDFLARE_R2_DELIVERY_URL: z.url().optional(),

  /**
   * R2 bucket name (the S3 bucket the app reads/writes).
   * Required in production for R2-backed collections; optional in development.
   */
  R2_BUCKET: z.string().optional(),

  /**
   * R2 S3 API access key id (from an R2 API token with object read/write).
   * Required in production for R2 uploads; optional in development.
   */
  R2_ACCESS_KEY_ID: z.string().optional(),

  /**
   * R2 S3 API secret access key (pairs with R2_ACCESS_KEY_ID).
   * Required in production for R2 uploads; optional in development.
   */
  R2_SECRET_ACCESS_KEY: z.string().optional(),

  /**
   * Optional R2 S3 endpoint override. Defaults to the account-derived endpoint
   * `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`. Set this when the
   * bucket lives in a jurisdiction — e.g. EU:
   * `https://<CLOUDFLARE_ACCOUNT_ID>.eu.r2.cloudflarestorage.com`. The native R2
   * binding hid the jurisdiction; the S3 API needs the exact endpoint.
   */
  R2_S3_ENDPOINT: z.url().optional(),

  /**
   * Cloudflare Stream webhook signing secret
   * Returned by `PUT /accounts/{id}/stream/webhook` and used to verify HMAC-SHA256
   * signatures on inbound webhooks. Production only — dev deployments do not
   * subscribe to the account-scoped Stream webhook.
   */
  CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().min(32).optional(),

  // ============================================
  // OPTIONAL - Email Services
  // ============================================

  /**
   * Resend API key for transactional emails
   * Required for production email sending
   * Falls back to Ethereal Email in development if not set
   */
  RESEND_API_KEY: z.string().min(20).optional(),

  // ============================================
  // APPLICATION URLS
  // ============================================

  /**
   * Sahaj Cloud server URL
   * Auto-derived from PORT if not set (http://localhost:{PORT})
   */
  SAHAJCLOUD_URL: z.url().optional(),

  /**
   * We Meditate Web frontend URL for live preview
   */
  WEMEDITATE_WEB_URL: z.url(),

  /**
   * Shared secret that allows trusted server-side preview requests to read drafts.
   * This should match the web frontend's SAHAJCLOUD_PREVIEW_SECRET value.
   */
  SAHAJCLOUD_PREVIEW_SECRET: z.string().min(16),

  /**
   * Sahaj Atlas frontend URL for live preview
   */
  SAHAJATLAS_URL: z.url(),

  /**
   * API documentation password (HTTP Basic Auth)
   * When set, password-protects the /api/docs endpoint
   * Any username is accepted; only the password is checked
   * Optional — docs are publicly accessible when not set
   */
  DOCS_PASSWORD: z.string().min(8, 'DOCS_PASSWORD must be at least 8 characters').optional(),

  /**
   * Server port number
   * @default 3000
   */
  PORT: z.coerce.number().int().min(1).max(65535).optional().default(3000),

  // ============================================
  // OBSERVABILITY - Sentry performance tracing
  // ============================================

  /**
   * Sentry performance-tracing sample rate (0–1). Consumed by
   * `src/sentry.server.config.ts`. A low non-zero rate (e.g. 0.1) keeps a
   * representative sample of admin transactions — including bulk edits and the
   * `/api/{collection}` reads the admin list/edit views fire — with their
   * DB-span breakdown, at negligible overhead. Set to 0 to disable tracing.
   * @default 0.1
   */
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  // ============================================
  // FRAMEWORK - Node.js/Next.js Environment
  // ============================================

  /**
   * Node.js environment mode
   * Automatically set by Next.js/Node.js - included for type safety
   */
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
})

// Type inference for TypeScript
export type ServerEnv = z.infer<typeof ServerEnvSchema>

let cachedServerEnv: ServerEnv | null = null

/**
 * Parse and cache server-side environment variables.
 *
 * Payload collection/config modules can be included in the admin client bundle.
 * Keep validation lazy so browser evaluation of an unused server module does not
 * fail on private variables that are intentionally unavailable to the client.
 */
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv

  if (typeof window !== 'undefined') {
    throw new Error(
      'serverEnv was accessed in a browser bundle. Import clientEnv from "@/lib/env/client" for client-side code.',
    )
  }

  try {
    cachedServerEnv = ServerEnvSchema.parse(process.env)
    return cachedServerEnv
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Note: Using console.error here is intentional for fail-fast behavior
      // This code runs before the Payload logger is initialized
      // We need immediate, visible feedback when environment validation fails
      // eslint-disable-next-line no-console
      console.error('❌ Environment validation error (server):')
      // eslint-disable-next-line no-console
      console.error(error.issues)
      // eslint-disable-next-line no-console
      console.error('\nCheck your .env file and compare with .env.example for required variables.')
      throw new Error(
        'Invalid server environment variables. Check the error details above and verify your .env file matches .env.example requirements.',
      )
    }
    throw error
  }
}

/**
 * Validated server-side environment variables.
 *
 * Accessing any property validates once and caches the parsed result. The proxy
 * preserves the old `serverEnv.NAME` call sites while avoiding eager validation
 * when this module is accidentally bundled into client-side admin code.
 */
export const serverEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string | symbol) {
    if (typeof prop === 'symbol') {
      if (prop === Symbol.toStringTag) return 'ServerEnv'
      return undefined
    }

    return getServerEnv()[prop as keyof ServerEnv]
  },
  getOwnPropertyDescriptor(_target, prop: string | symbol) {
    const env = getServerEnv()
    if (!(prop in env)) return undefined

    return {
      configurable: true,
      enumerable: true,
      value: env[prop as keyof ServerEnv],
    }
  },
  has(_target, prop: string | symbol) {
    return prop in getServerEnv()
  },
  ownKeys() {
    return Reflect.ownKeys(getServerEnv())
  },
})

// Re-export client types and values for convenience in server code
export type { ClientEnv } from './client'
export { clientEnv } from './client'
