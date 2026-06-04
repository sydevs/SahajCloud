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
 * import { serverEnv, requireBinding } from '@/lib/env'
 *
 * const secret = serverEnv.PAYLOAD_SECRET
 * const r2 = requireBinding<R2Bucket>(env.R2, 'R2')
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
   * Nirmala Vidya API key for fetching lecture metadata from Vimeo
   * Optional at startup — validated at point of use when creating/refreshing lectures
   */
  NIRMALA_VIDYA_API_KEY: z
    .string()
    .min(20, 'NIRMALA_VIDYA_API_KEY must be at least 20 characters')
    .optional(),

  // ============================================
  // OPTIONAL - Cloudflare Services (Production)
  // ============================================

  /**
   * Cloudflare Account ID
   * Required for Cloudflare Images, Stream, and R2 in production
   * Optional in development (falls back to local file storage)
   */
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),

  /**
   * Cloudflare API Key (unified token for Images and Stream)
   * Required for Cloudflare services in production
   * Optional in development
   */
  CLOUDFLARE_API_KEY: z.string().min(20).optional(),

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
   * Cloudflare R2 public delivery URL
   * Custom domain configured in Cloudflare R2 + CDN
   */
  CLOUDFLARE_R2_DELIVERY_URL: z.url().optional(),

  /**
   * Cloudflare Stream webhook signing secret
   * Returned by `PUT /accounts/{id}/stream/webhook` and used to verify HMAC-SHA256
   * signatures on inbound webhooks. Production only — dev deployments do not
   * subscribe to the account-scoped Stream webhook.
   * Set via: `wrangler secret put CLOUDFLARE_STREAM_WEBHOOK_SECRET`
   */
  CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().min(32).optional(),

  /**
   * Wrangler environment selection
   * - 'dev': Uses [env.dev] configuration from wrangler.toml
   * - 'preview': Uses [env.preview] configuration — e.g. `payload migrate`
   *   against the remote sahajcloud-preview D1 from CI (deploy:database:preview)
   * - 'production': Uses [env.production] configuration from wrangler.toml
   * - undefined/empty: Uses default (production) configuration
   */
  CLOUDFLARE_ENV: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.enum(['dev', 'production', 'preview']).optional(),
  ),

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

/**
 * Runtime validation helper for Cloudflare Workers bindings
 *
 * Validates that a required Cloudflare binding (R2, D1, KV, etc.) is present
 * and returns it with proper TypeScript typing.
 *
 * **Usage**:
 * ```typescript
 * import type { R2Bucket } from '@cloudflare/workers-types'
 * import { requireBinding } from '@/lib/env'
 *
 * // In storagePlugin or other Cloudflare-specific code
 * const r2Bucket = requireBinding<R2Bucket>(env.R2, 'R2')
 * ```
 *
 * @param binding - The binding value to validate (can be undefined)
 * @param name - Name of the binding for error messages
 * @returns The validated binding with proper type
 * @throws Error if binding is undefined or null
 *
 * @template T - The expected binding type (R2Bucket, D1Database, etc.)
 */
export function requireBinding<T>(binding: T | undefined | null, name: string): T {
  if (binding === undefined || binding === null) {
    throw new Error(
      `Required Cloudflare binding "${name}" is not available. ` +
        `Ensure the binding is configured in wrangler.toml and the env object is provided.`,
    )
  }
  return binding
}

// Re-export client types and values for convenience in server code
export type { ClientEnv } from './client'
export { clientEnv } from './client'
