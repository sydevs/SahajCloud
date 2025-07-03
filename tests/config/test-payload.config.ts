// Test-specific Payload configuration that uses MongoDB Memory Server
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from '../../src/collections/Users'
import { Media } from '../../src/collections/Media'
import { Narrators } from '../../src/collections/Narrators'
import { Meditations } from '../../src/collections/Meditations'
import { Tags } from '../../src/collections/Tags'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const createTestConfig = (mongoUri: string) => buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname, '../../src'),
    },
    // Disable admin UI for tests
    disable: true,
  },
  collections: [Users, Media, Narrators, Meditations, Tags],
  editor: lexicalEditor(),
  secret: 'test-secret-key',
  typescript: {
    outputFile: path.resolve(dirname, '../../src/payload-types.ts'),
  },
  db: mongooseAdapter({
    url: mongoUri,
  }),
  sharp,
  plugins: [],
  // Disable file uploads for tests
  upload: {
    limits: {
      fileSize: 1024 * 1024, // 1MB
    },
  },
})