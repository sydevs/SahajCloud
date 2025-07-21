// storage-adapter-import-placeholder
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig, Config } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { collections, Users } from './collections'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const isTestEnvironment = process.env.NODE_ENV === 'test'
const isProduction = process.env.NODE_ENV === 'production'

const payloadConfig = (overrides?: Partial<Config>) => {
  return buildConfig({
    admin: {
      user: Users.slug,
      importMap: {
        baseDir: path.resolve(dirname),
      },
      components: {
        providers: [
          {
            path: './components/AdminProvider.tsx',
          },
        ],
      },
      // Disable admin UI in test environment
      disable: isTestEnvironment,
    },
    collections,
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || '',
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
    db: mongooseAdapter({
      url: process.env.DATABASE_URI || '',
    }),
    // Email configuration (disabled in test environment to avoid model conflicts)
    ...(isTestEnvironment ? {} : {
      email: nodemailerAdapter(
        isProduction ? {
          defaultFromAddress: process.env.SMTP_FROM || 'contact@sydevelopers.com',
          defaultFromName: 'SY Developers',
          transportOptions: {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            secure: false, // Use STARTTLS
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          },
        } : {
          defaultFromAddress: 'dev@sydevelopers.com',
          defaultFromName: 'SY Developers (Dev)',
          // No transportOptions - uses Ethereal Email in development
        }
      )
    }),
    sharp,
    plugins: [
    ],
    upload: {
      limits: {
        fileSize: 5000000, // 5MB, written in bytes
      },
    },
    // Allow overrides (especially important for test database URIs)
    ...overrides,
  })
}

export { payloadConfig }
export default payloadConfig()
