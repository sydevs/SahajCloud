/**
 * E2E Test-specific Payload configuration
 *
 * Uses a dedicated Postgres schema ("e2e") so E2E data stays isolated from dev
 * and from the per-suite integration-test schemas. DATABASE_URL points at the
 * test Postgres (Docker locally / a service container in CI).
 *
 * Key differences from production config:
 * - Disables external services (email, Sentry)
 * - Disables auto-login (tests need to authenticate)
 * - Uses a test-specific secret
 */
import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'

import { LOCALES, DEFAULT_LOCALE } from '@/lib/locales'

import { collections, Managers } from '../../src/collections'
import { globals } from '../../src/globals'
import { tasks } from '../../src/jobs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
  secret: 'e2e-test-secret-key-with-32-chars',
  typescript: {
    outputFile: path.resolve(__dirname, '../../src/payload-types.ts'),
  },
  // Dedicated Postgres schema for E2E (auto-created/synced via push)
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
      // Tests don't need durability — skip the per-commit fsync wait.
      options: '-c synchronous_commit=off',
    },
    push: true,
    schemaName: 'e2e',
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

export default e2ePayloadConfig
