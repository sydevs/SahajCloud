import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig, Config } from 'payload'

import { collections, Managers } from '../../src/collections'
import { globals } from '../../src/globals'
import { LOCALES, DEFAULT_LOCALE } from '../../src/lib/locales'
import { TEST_PG_POOL_OPTIONS } from '../../tests/utils/postgresTestPool'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Test Payload Configuration
 *
 * Used for migration/import-script testing against a Postgres test database
 * (dedicated `seed_test` schema, auto-synced via push). Simplified vs the main
 * config — no email, no plugins, no admin UI.
 */
export const testPayloadConfig = (overrides?: Partial<Config>) => {
  return buildConfig({
    serverURL: 'http://localhost:3000',
    localization: {
      locales: LOCALES.map((l) => l.code),
      defaultLocale: DEFAULT_LOCALE,
    },
    admin: {
      user: Managers.slug,
      disable: true, // Always disable admin UI in tests
    },
    collections,
    globals,
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || 'test-secret-key-for-migration-testing',
    typescript: {
      outputFile: path.resolve(dirname, '../../src/payload-types.ts'),
    },
    // Postgres test database — dedicated schema, auto-created/synced via push.
    db: postgresAdapter({
      pool: {
        connectionString: process.env.DATABASE_URL,
        options: TEST_PG_POOL_OPTIONS,
      },
      push: true,
      schemaName: 'seed_test',
    }),
    // No plugins for tests - keeps it simple and fast
    plugins: [],
    // Allow overrides (for custom test scenarios)
    ...overrides,
  })
}

export default testPayloadConfig()
