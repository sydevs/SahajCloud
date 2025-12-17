/**
 * E2E Test-specific Payload configuration
 *
 * Uses file-based SQLite database for E2E tests to ensure:
 * - Database isolation from development D1 database
 * - Persistence across dev server lifecycle (shared between test runner and server)
 * - Automatic test data seeding via global setup
 *
 * Key differences from production config:
 * - Uses SQLite adapter instead of D1
 * - Disables external services (email, Sentry)
 * - Disables auto-login (tests need to authenticate)
 * - Uses test-specific secret
 */
import path from 'path'
import { fileURLToPath } from 'url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'

import { LOCALES, DEFAULT_LOCALE } from '@/lib/locales'

import { collections, Managers } from '../../src/collections'
import { globals } from '../../src/globals'
import { tasks } from '../../src/jobs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// E2E test database path - file-based for persistence
const E2E_DATABASE_PATH = path.resolve(__dirname, '../.e2e.sqlite')

/**
 * E2E-specific Payload configuration
 * Mirrors production config but with test-optimized settings
 */
export const e2ePayloadConfig = buildConfig({
  serverURL: 'http://localhost:4567',
  localization: {
    locales: LOCALES.map((l) => l.code),
    defaultLocale: DEFAULT_LOCALE,
  },
  cors: ['http://localhost:4567'],
  csrf: ['http://localhost:4567'],
  admin: {
    user: Managers.slug,
    importMap: {
      baseDir: path.resolve(__dirname, '../../src'),
    },
    components: {
      providers: [
        {
          path: '@/components/AdminProvider.tsx',
        },
      ],
      beforeNavLinks: ['@/components/admin/ProjectSelector'],
      graphics: {
        Logo: '@/components/branding/Logo',
        Icon: '@/components/branding/Icon',
      },
      views: {
        dashboard: {
          Component: '@/components/admin/Dashboard',
        },
      },
    },
    // Enable admin UI for E2E testing (unlike integration tests)
    disable: false,
    // Disable auto-login - tests should authenticate manually
    autoLogin: false,
  },
  collections,
  globals,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'e2e-test-secret-key',
  typescript: {
    outputFile: path.resolve(__dirname, '../../src/payload-types.ts'),
  },
  // Use file-based SQLite for E2E tests
  db: sqliteAdapter({
    client: {
      url: `file:${E2E_DATABASE_PATH}`,
    },
    push: true, // Auto-create/sync schema
  }),
  jobs: {
    tasks,
    deleteJobOnComplete: true,
  },
  // No email adapter - disable email in E2E tests
  // No plugins that require external services
  upload: {
    limits: {
      fileSize: 104857600, // 100MB global limit
    },
  },
})

export { E2E_DATABASE_PATH }
export default e2ePayloadConfig
