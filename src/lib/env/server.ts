/**
 * Server environment variables.
 *
 * This module validates server environment variables with Zod, and gives
 * type-safe access to them. It extends the client environment with
 * server-only variables, such as secrets and API keys.
 *
 * Import this file only from server-side code.
 * For client-side code, use `@/lib/env/client` instead.
 *
 * Usage:
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
 * Server-side environment variables schema.
 *
 * The client never sees these variables. They include:
 * - Secrets and API keys
 * - Database connection strings
 * - Internal service URLs
 *
 * The server schema also includes every client environment variable.
 */
const ServerEnvSchema = ClientEnvSchema.extend({
  // ============================================
  // REQUIRED - Core Application
  // ============================================

  /**
   * PayloadCMS encryption secret.
   * Must be at least 32 characters long, to match AES-256 key strength.
   */
  PAYLOAD_SECRET: z.string().min(32, 'PAYLOAD_SECRET must be at least 32 characters'),

  /**
   * Postgres connection string (Railway Postgres).
   * The Payload Postgres adapter in `src/payload.config.ts` uses this value.
   * Example: `postgresql://user:password@host:5432/dbname`
   */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Postgres connection string)'),

  /**
   * Max size of the Postgres connection pool (node-postgres `pool.max`).
   * The Payload Postgres adapter in `src/payload.config.ts` uses this value.
   * Set it to the Railway Postgres connection limit, divided across the
   * running instances. See the pool-sizing notes in `docs/architecture.md`.
   * Prod, as of 2026-07: Postgres allows max_connections=100 (97 usable), with
   * 1 app replica. The default of 20 leaves ample headroom, and doubles the
   * bulk-publish burst capacity.
   * @default 20
   */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(20),

  /**
   * Turn on Drizzle query logging (SQL and parameters, to the console).
   * This is opt-in, and production always disables it.
   * Use it to capture the query trail behind a slow admin operation, in dev
   * or staging. Any truthy string (`true` or `1`) turns it on.
   * Pair it with Railway Postgres `log_min_duration_statement`, for
   * server-side timings. See `docs/architecture.md`.
   * @default false
   */
  DB_QUERY_LOGGING: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),

  /**
   * Nirmala Vidya API key. Fetches lecture metadata from Vimeo.
   * Optional at startup. The app validates it at the point of use, when it
   * creates or refreshes lectures.
   */
  NIRMALA_VIDYA_API_KEY: z
    .string()
    .min(20, 'NIRMALA_VIDYA_API_KEY must be at least 20 characters')
    .optional(),

  /**
   * Cloudflare Turnstile secret key.
   * The write-guard plugin uses it to verify the captcha token server-side,
   * on public collection writes (`src/lib/turnstile/verifyTurnstile.ts`).
   *
   * Required in production. Like `NIRMALA_VIDYA_API_KEY`, the app validates it
   * at the point of use, not at startup, so a missing key cannot take down
   * the whole app, including a per-PR Railway preview.
   *
   * The verifier fails closed when this key is unset: it refuses the write
   * with a 500, and logs the failure. It never lets an unverified write pass.
   * In development, use Cloudflare's always-passing test key
   * `1x0000000000000000000000000000000AA` (see `.env.example`).
   */
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),

  // ============================================
  // OPTIONAL: Cloudflare media services (Images, Stream), and R2 over S3
  // ============================================
  //
  // Images and Stream stay on Cloudflare, over plain HTTPS APIs. The app now
  // reaches R2 through the S3-compatible API (see `src/plugins/storage`), not
  // a Workers binding. When the credentials are unset, storage falls back to
  // local files in development.

  /**
   * Cloudflare account ID.
   * The Images and Stream HTTPS APIs use this, and it derives the R2 S3
   * endpoint (`https://<accountId>.r2.cloudflarestorage.com`). Optional in
   * development.
   */
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),

  /**
   * Cloudflare API key (one token, for Images and Stream).
   * Required in production, for the Cloudflare media services. Optional in
   * development.
   */
  CLOUDFLARE_API_KEY: z.string().min(20).optional(),

  /**
   * Cloudflare zone ID for the site's zone.
   * With `CLOUDFLARE_CACHE_PURGE_TOKEN`, this turns on edge-cache purge-on-write.
   * When unset, purging is off, and the app relies on the Cache Rule's TTL
   * instead. See `src/plugins/cache`.
   */
  CLOUDFLARE_ZONE_ID: z.string().optional(),

  /**
   * Cloudflare API token, scoped to `Cache Purge` for the zone above.
   * Optional. When unset, edge-cache purge-on-write does nothing, and the TTL
   * is the only invalidation.
   */
  CLOUDFLARE_CACHE_PURGE_TOKEN: z.string().min(20).optional(),

  /**
   * Cloudflare Images delivery URL.
   * Format: https://imagedelivery.net/<hash>
   */
  CLOUDFLARE_IMAGES_DELIVERY_URL: z.url().optional(),

  /**
   * Cloudflare Stream delivery URL.
   * Format: https://customer-<code>.cloudflarestream.com
   */
  CLOUDFLARE_STREAM_DELIVERY_URL: z.url().optional(),

  /**
   * R2 public delivery URL (a custom domain or CDN in front of the R2 bucket).
   * The S3 migration did not change delivery domains, for example
   * https://assets.sydevelopers.com.
   */
  CLOUDFLARE_R2_DELIVERY_URL: z.url().optional(),

  /**
   * R2 bucket name (the S3 bucket the app reads and writes).
   * Required in production for R2-backed collections. Optional in development.
   */
  R2_BUCKET: z.string().optional(),

  /**
   * R2 S3 API access key ID, from an R2 API token with object read and write access.
   * Required in production for R2 uploads. Optional in development.
   */
  R2_ACCESS_KEY_ID: z.string().optional(),

  /**
   * R2 S3 API secret access key. Pairs with R2_ACCESS_KEY_ID.
   * Required in production for R2 uploads. Optional in development.
   */
  R2_SECRET_ACCESS_KEY: z.string().optional(),

  /**
   * Optional override for the R2 S3 endpoint.
   * Defaults to the account-derived endpoint
   * `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`.
   * Set this when the bucket lives in a jurisdiction, for example EU:
   * `https://<CLOUDFLARE_ACCOUNT_ID>.eu.r2.cloudflarestorage.com`.
   * The native R2 binding hid the jurisdiction. The S3 API needs the exact endpoint.
   */
  R2_S3_ENDPOINT: z.url().optional(),

  /**
   * Cloudflare Stream webhook signing secret.
   * `PUT /accounts/{id}/stream/webhook` returns this value. The app uses it
   * to verify HMAC-SHA256 signatures on inbound webhooks.
   * Production only. Dev deployments do not subscribe to the account-scoped
   * Stream webhook.
   */
  CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().min(32).optional(),

  // ============================================
  // OPTIONAL: Email Services
  // ============================================

  /**
   * Resend API key for transactional email.
   * Production only. When unset in production, the app logs the mail and drops it.
   */
  RESEND_API_KEY: z.string().min(20).optional(),

  /**
   * SMTP endpoint for captured mail that Mailpit does not deliver.
   * Local dev and Railway PR previews use this. Neither must ever deliver real mail.
   * When set outside production, it overrides every other adapter choice.
   * When unset outside production, email is off, and the app logs a warning
   * instead of silently sending mail somewhere.
   *
   * Shape: smtp://user:pass@host:port
   */
  SMTP_URL: z.url().optional(),

  // ============================================
  // APPLICATION URLS
  // ============================================

  /**
   * Sahaj Cloud server URL.
   * If not set, the app derives it from PORT (http://localhost:{PORT}).
   */
  SAHAJCLOUD_URL: z.url().optional(),

  /**
   * We Meditate Web frontend URL, for live preview.
   */
  WEMEDITATE_WEB_URL: z.url(),

  /**
   * Path where the Atlas widget mounts on the We Meditate web frontend.
   *
   * This is the canonical fallback for a region no client owns. When no
   * canonical-enabled client sits anywhere in a region's ancestry, its
   * `webUrl` resolves to `WEMEDITATE_WEB_URL + WEMEDITATE_ATLAS_BASE_PATH + webPath`.
   * This value is a path only. The host comes from `WEMEDITATE_WEB_URL`.
   * Use `''` to mount the widget at the root.
   */
  WEMEDITATE_ATLAS_BASE_PATH: z
    .string()
    .regex(/^(\/[^/?#\s]+)*$/, 'Must be empty or a slash-prefixed path with no query or fragment')
    .optional()
    .default('/map'),

  /**
   * Shared secret that allows trusted server-side preview requests to read drafts.
   * This should match the web frontend's SAHAJCLOUD_PREVIEW_SECRET value.
   */
  SAHAJCLOUD_PREVIEW_SECRET: z.string().min(16),

  /**
   * Sahaj Atlas frontend URL, for live preview.
   */
  SAHAJATLAS_URL: z.url(),

  /**
   * API documentation password (HTTP Basic Auth).
   * When set, it password-protects the /api/docs endpoint.
   * The app accepts any username, and checks only the password.
   * Optional. The docs are public when this is not set.
   */
  DOCS_PASSWORD: z.string().min(8, 'DOCS_PASSWORD must be at least 8 characters').optional(),

  /**
   * Admin password for a Railway PR preview.
   *
   * Railway supplies this to preview environments, and CI supplies it to the
   * smoke lane. On boot, a preview reconciles its admin account against this
   * value (`@/plugins/previewAdmin`). Rotating the value takes effect on the
   * next deploy, so an environment never gets orphaned with a stale password.
   *
   * Optional, and absent by design on production, local dev, and the test
   * lanes. The seeding gate also reads Railway's environment name, so this
   * value's absence is not what stops seeding from running there.
   */
  PREVIEW_ADMIN_PASSWORD: z.string().min(1).optional(),

  /**
   * Email address for the provisioned preview admin.
   * Optional. Defaults to `contact@sydevelopers.com`, to match the smoke lane.
   */
  PREVIEW_ADMIN_EMAIL: z.email().optional(),

  /**
   * Server port number.
   * @default 3000
   */
  PORT: z.coerce.number().int().min(1).max(65535).optional().default(3000),

  // ============================================
  // OBSERVABILITY - Sentry performance tracing
  // ============================================

  /**
   * Sentry performance-tracing sample rate (0 to 1).
   * `src/sentry.server.config.ts` reads this value.
   * A low non-zero rate, for example 0.1, keeps a representative sample of
   * admin transactions and their DB-span breakdown, at little overhead.
   * This sample includes bulk edits and the `/api/{collection}` reads that
   * the admin list and edit views fire.
   * Set this to 0 to turn tracing off.
   * @default 0.1
   */
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  // ============================================
  // FRAMEWORK - Node.js/Next.js Environment
  // ============================================

  /**
   * Node.js environment mode.
   * Next.js and Node.js set this automatically. It is included here for type safety.
   */
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
})

export type ServerEnv = z.infer<typeof ServerEnvSchema>

let cachedServerEnv: ServerEnv | null = null

/**
 * Parse server-side environment variables once, and cache the result.
 *
 * A Payload collection or config module can end up in the admin client bundle.
 * Validation stays lazy so that evaluating an unused server module in the
 * browser does not fail on private variables the client must never see.
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
      // console.error is intentional here, for fail-fast behavior.
      // This code runs before Payload starts its logger.
      // Environment validation failures need immediate, visible feedback.
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
 * Reading any property validates the environment once, and caches the
 * result. The proxy keeps the old `serverEnv.NAME` call sites working, while
 * it avoids eager validation if this module ends up bundled into
 * client-side admin code.
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

// Re-export client types and values, for convenience in server code.
export type { ClientEnv } from './client'
export { clientEnv } from './client'
