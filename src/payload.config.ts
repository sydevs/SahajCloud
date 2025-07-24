import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig, Config } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { collections, Users } from './collections'
import { createMinIOStorage, isMinIOConfigured } from './lib/minioAdapter'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const isTestEnvironment = process.env.NODE_ENV === 'test'
const isProduction = process.env.NODE_ENV === 'production'

// Create MinIO storage plugin if configured (only in production/staging)
const minioStoragePlugin = !isTestEnvironment && isMinIOConfigured() ? createMinIOStorage() : null

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
      autoLogin: isTestEnvironment ? { email: 'contact@sydevelopers.com' } : false,
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
    // API Configuration
    cors: isTestEnvironment ? false : (process.env.PAYLOAD_PUBLIC_CORS_ORIGINS || '*').split(','),
    csrf: isTestEnvironment ? false : (isProduction ? ['https://sydevelopers.com'] : ['http://localhost:3000']),
    rateLimit: {
      window: 15 * 60 * 1000, // 15 minutes
      max: isProduction ? 100 : 10000, // limit each IP to 100 requests per windowMs in production
      trustProxy: true, // Trust proxy headers for rate limiting in production
      skip: () => !isProduction, // Skip rate limiting in development
    },
    graphQL: {
      disable: false,
      schemaOutputFile: path.resolve(dirname, 'graphql-schema.graphql'),
      disablePlaygroundInProduction: true,
      maxComplexity: 1000, // Prevent overly complex queries
    },
    // API Key configuration for secure external access
    serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000',
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
