import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig, Config } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { collections, Users } from './collections'
import { tasks } from './jobs'
import { createMinIOStorage, isMinIOConfigured } from './lib/minioAdapter'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const isTestEnvironment = process.env.NODE_ENV === 'test'
const isProduction = process.env.NODE_ENV === 'production'

// Create MinIO storage plugin if configured (only in production/staging)
const minioStoragePlugin = !isTestEnvironment && isMinIOConfigured() ? createMinIOStorage() : null

const payloadConfig = (overrides?: Partial<Config>) => {
  return buildConfig({
    localization: {
      locales: ['en', 'it'],
      defaultLocale: 'en',
    },
    admin: {
      user: Users.slug,
      importMap: {
        baseDir: path.resolve(dirname),
      },
      components: {
        providers: [
          {
            path: '@/components/AdminProvider.tsx',
          },
        ],
      },
      // Disable admin UI in test environment
      disable: isTestEnvironment,
      autoLogin: isTestEnvironment ? { email: 'contact@sydevelopers.com' } : false,
    },
    collections,
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || '',
    jobs: {
      tasks,
      deleteJobOnComplete: true,
      autoRun: [
        {
          cron: '0 * * * *', // Runs every hour
          queue: 'nightly',
        },
      ],
    },
    graphQL: {
      disable: true, // Disable GraphQL as per requirements
    },
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
      // Add MinIO S3 storage plugin if configured
      ...(minioStoragePlugin ? [minioStoragePlugin] : []),
    ],
    upload: {
      limits: {
        fileSize: 104857600, // 100MB global limit, written in bytes (collections will have their own limits)
      },
    },
    // Allow overrides (especially important for test database URIs)
    ...overrides,
  })
}

export { payloadConfig }
export default payloadConfig()
