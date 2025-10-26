import { buildConfig, Config } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { storagePlugin } from './lib/storage'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'

import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { adminOnlyAccess, permissionBasedAccess } from '@/lib/accessControl'
import { collections, Managers } from './collections'
import { globals } from './globals'
import { tasks } from './jobs'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const isTestEnvironment = process.env.NODE_ENV === 'test'
const isProduction = process.env.NODE_ENV === 'production'

const payloadConfig = (overrides?: Partial<Config>) => {
  return buildConfig({
    serverURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
    localization: {
      locales: [
        'en',
        'es',
        'de',
        'it',
        'fr',
        'ru',
        'ro',
        'cs',
        'uk',
        'el',
        'hy',
        'pl',
        'pt-br',
        'fa',
        'bg',
        'tr',
      ],
      defaultLocale: 'en',
    },
    cors: [
      process.env.WEMEDITATE_WEB_URL || 'http://localhost:5173',
      process.env.SAHAJATLAS_URL || 'http://localhost:5174',
    ],
    admin: {
      user: Managers.slug,
      importMap: {
        baseDir: path.resolve(dirname),
      },
      components: {
        providers: [
          {
            path: '@/components/AdminProvider.tsx',
          },
        ],
        graphics: {
          Logo: '@/components/branding/Icon',
          Icon: '@/components/branding/Icon',
        },
      },
      // Disable admin UI in test environment
      disable: isTestEnvironment,
      autoLogin: !isProduction ? { email: 'contact@sydevelopers.com' } : false,
    },
    collections,
    globals,
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
      jobsCollectionOverrides: ({ defaultJobsCollection }) => {
        if (!defaultJobsCollection.admin) {
          defaultJobsCollection.admin = {}
        }

        defaultJobsCollection.admin.hidden = ({ user }) => !user?.admin
        defaultJobsCollection.access = adminOnlyAccess()
        return defaultJobsCollection
      },
    },
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
    db: mongooseAdapter({
      url: process.env.DATABASE_URI || '',
    }),
    // Email configuration (disabled in test environment to avoid model conflicts)
    ...(isTestEnvironment
      ? {}
      : {
          // email: nodemailerAdapter(
          //   isProduction
          //     ? {
          //         defaultFromAddress: process.env.SMTP_FROM || 'contact@sydevelopers.com',
          //         defaultFromName: 'SY Developers',
          //         transportOptions: {
          //           host: process.env.SMTP_HOST || 'smtp.gmail.com',
          //           port: Number(process.env.SMTP_PORT) || 587,
          //           secure: false, // Use STARTTLS
          //           auth: {
          //             user: process.env.SMTP_USER,
          //             pass: process.env.SMTP_PASS,
          //           },
          //         },
          //       }
          //     : {
          //         defaultFromAddress: 'dev@sydevelopers.com',
          //         defaultFromName: 'SY Developers (Dev)',
          //         // No transportOptions - uses Ethereal Email in development
          //       },
          // ),
        }),
    sharp,
    plugins: [
      storagePlugin(), // Handles file storage
      seoPlugin({
        collections: ['pages'],
        uploadsCollection: 'media',
        generateTitle: ({ doc }) => `We Meditate — ${doc.title}`,
        generateDescription: ({ doc }) => doc.content,
        tabbedUI: true,
      }),
      formBuilderPlugin({
        defaultToEmail: 'contact@sydevelopers.com',
        formOverrides: {
          access: permissionBasedAccess('forms'),
          admin: {
            group: 'Resources',
          },
        },
        formSubmissionOverrides: {
          access: {
            update: () => false,
            create: () => false,
            delete: () => false,
          },
          admin: {
            hidden: ({ user }) => !user?.admin,
            group: 'System',
          },
        },
      }),
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
