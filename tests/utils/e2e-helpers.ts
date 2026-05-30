/**
 * E2E Test Helpers
 *
 * Shared utilities for Playwright E2E tests including:
 * - Test credentials and configuration constants
 * - Common authentication helpers
 * - File buffer utilities
 */
import type { Page } from '@playwright/test'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================
// Test Configuration Constants
// ============================================

/**
 * Default manager credentials for E2E tests
 * These match the credentials seeded in global setup and documented in CLAUDE.md
 */
export const E2E_CREDENTIALS = {
  email: 'contact@sydevelopers.com',
  password: 'evk1VTH5dxz_nhg-mzk',
  name: 'E2E Test Admin',
} as const

/**
 * E2E test server configuration
 */
export const E2E_CONFIG = {
  port: 4567,
  baseUrl: 'http://localhost:4567',
  secret: 'e2e-test-secret-key',
} as const

/**
 * Path to sample test files for seeding
 */
export const SAMPLE_FILES_DIR = path.join(__dirname, '../files')

// ============================================
// Authentication Helpers
// ============================================

/**
 * Login to admin panel with default E2E credentials
 *
 * @param page - Playwright page instance
 * @param credentials - Optional custom credentials (defaults to E2E_CREDENTIALS)
 */
export async function adminLogin(
  page: Page,
  credentials: { email: string; password: string } = E2E_CREDENTIALS,
): Promise<void> {
  // Navigate to admin login
  await page.goto('/admin/login')

  // Wait for login form to be visible (important for server startup time)
  await page.waitForSelector('input[name="email"]', { timeout: 60000 })

  // Fill in credentials
  await page.fill('input[name="email"]', credentials.email)
  await page.fill('input[name="password"]', credentials.password)
  await page.click('button[type="submit"]')

  // Wait for dashboard to load
  await page.waitForURL('**/admin', { timeout: 30000 })
}

// ============================================
// File Buffer Utilities
// ============================================

/**
 * Create a file object suitable for Payload CMS uploads
 * Handles proper Buffer conversion to avoid type casting issues
 *
 * @param filePath - Absolute path to the file
 * @param overrides - Optional overrides for filename or mimetype
 * @returns File object ready for Payload upload, or null if file doesn't exist
 */
export function createFileObject(
  filePath: string,
  overrides?: {
    name?: string
    mimetype?: string
  },
): { data: Buffer; mimetype: string; name: string; size: number } | null {
  if (!fs.existsSync(filePath)) {
    return null
  }

  const fileBuffer = fs.readFileSync(filePath)
  const filename = overrides?.name ?? path.basename(filePath)
  const mimetype = overrides?.mimetype ?? getMimeType(filePath)

  return {
    data: Buffer.from(fileBuffer),
    mimetype,
    name: filename,
    size: fileBuffer.length,
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
  }
  return mimeTypes[ext] ?? 'application/octet-stream'
}

// ============================================
// Test Data Seeding Utilities
// ============================================

/**
 * Seed status tracking for error recovery
 * Tracks which items have been successfully seeded
 */
export interface SeedStatus {
  manager: boolean
  narrator: boolean
  image: boolean
  meditation: boolean
  frames: boolean
}

/**
 * Create initial seed status (all false)
 */
export function createSeedStatus(): SeedStatus {
  return {
    manager: false,
    narrator: false,
    image: false,
    meditation: false,
    frames: false,
  }
}

/**
 * Check if a seeding operation should be attempted based on dependencies
 *
 * @param status - Current seed status
 * @param requirements - Array of status keys that must be true
 * @returns true if all requirements are met
 */
export function canSeed(status: SeedStatus, requirements: (keyof SeedStatus)[]): boolean {
  return requirements.every((req) => status[req])
}
