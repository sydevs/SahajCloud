import path from 'path'
import { fileURLToPath } from 'url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig, Config } from 'payload'
import sharp from 'sharp'

import { LOCALES, DEFAULT_LOCALE } from '../../src/lib/locales'
import { collections, Managers } from '../../src/collections'
import { globals } from '../../src/globals'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Test Payload Configuration
 *
 * This configuration is used for migration script testing with an in-memory SQLite database.
 * It's simplified compared to the main config - no email, no plugins, no admin UI.
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
    // Use in-memory SQLite for fast, isolated tests
    db: sqliteAdapter({
      client: {
        url: ':memory:', // In-memory database - no file persistence
      },
    }),
    sharp,
    // No plugins for tests - keeps it simple and fast
    plugins: [],
    // Allow overrides (for custom test scenarios)
    ...overrides,
  })
}

export default testPayloadConfig()
