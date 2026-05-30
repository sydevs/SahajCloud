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
// Following Next.js convention: .env.local takes precedence over .env
dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local', override: true })

/**
 * Seed scripts environment variables schema
 */
const SeedEnvSchema = z.object({
  /**
   * Admin email for seed scripts authentication
   * Required when running seed scripts that create admin users
   */
  ADMIN_EMAIL: z.email().optional(),

  /**
   * Admin password for seed scripts authentication
   * Minimum 8 characters
   */
  ADMIN_PASSWORD: z.string().min(8).optional(),

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
