/**
 * Environment Variable Validation for Seed Scripts
 *
 * This module provides type-safe environment variable validation for seed scripts only.
 * Maintains strict separation from the main application environment configuration.
 */
import dotenv from 'dotenv'
import { z } from 'zod'

// Load env files BEFORE parsing process.env
// This must happen at module load time, before the IIFE below runs
// Next.js precedence: the real shell environment wins, then .env.local, then
// .env. dotenv walks the array in order and never overwrites a key that is
// already set, so listing .env.local first gives all three rules at once.
// Do NOT reintroduce `override: true` — it lets a blank `FOO=` in a file clobber
// a credential passed on the command line (see tests/unit/env-file-precedence).
dotenv.config({ path: ['.env.local', '.env'] })

/**
 * Make a var optional *and* tolerate an empty value.
 *
 * A bare `.optional()` only accepts `undefined`, so `FOO=` in a .env file (an
 * empty string) still fails the inner rules. Deliberately blanking a credential
 * you don't need — as local dev does, where auto-login means `pnpm seed` needs
 * none — should read as "unset", not as a validation error.
 */
function emptyAsUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional())
}

/**
 * Seed scripts environment variables schema
 */
const SeedEnvSchema = z.object({
  /**
   * Admin email for seed scripts authentication
   * Required when running seed scripts that create admin users
   */
  ADMIN_EMAIL: emptyAsUndefined(z.email()),

  /**
   * Admin password for seed scripts authentication
   * Minimum 8 characters
   */
  ADMIN_PASSWORD: emptyAsUndefined(z.string().min(8)),

  /**
   * Storyblok CMS access token
   * Only required for importing Path Steps from Storyblok
   */
  STORYBLOK_ACCESS_TOKEN: z.string().optional(),

  /**
   * Cloudflare R2 S3-compatible access key ID
   * Only required for R2 reset scripts (S3 API compatibility)
   */
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().optional(),

  /**
   * Cloudflare R2 S3-compatible secret access key
   * Only required for R2 reset scripts (S3 API compatibility)
   */
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().optional(),

  /**
   * Cloudflare Account ID (from main app env)
   * Required for Cloudflare API operations
   */
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),

  /**
   * Cloudflare API Key (from main app env)
   * Required for Cloudflare API operations
   */
  CLOUDFLARE_API_KEY: z.string().min(20).optional(),

  /**
   * Server port number
   * Used to construct target URL for seed operations
   */
  PORT: z.coerce.number().int().min(1).max(65535).optional().default(3000),

  /**
   * Sahaj Cloud server URL
   * Target URL for seed operations
   */
  SAHAJCLOUD_URL: z.url().optional(),

  /**
   * Storage base URL
   * Base URL for accessing uploaded media files
   * Used for importing files from external sources
   */
  STORAGE_BASE_URL: z
    .url()
    .optional()
    .default('https://storage.googleapis.com/media.sydevelopers.com'),
})

// Type inference for TypeScript
export type SeedEnv = z.infer<typeof SeedEnvSchema>

/**
 * Validated seed environment variables
 *
 * Throws validation error if seed script environment is invalid.
 * Provides type-safe access to seed-specific environment variables.
 */
export const seedEnv = (() => {
  try {
    return SeedEnvSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Seed environment validation error:')

      console.error(error.issues)

      console.error('\nCheck your .env file for seed script variables.')
      throw new Error(
        'Invalid seed environment variables. Check the error details above and verify your .env file.',
      )
    }
    throw error
  }
})()
