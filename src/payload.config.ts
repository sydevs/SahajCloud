import path from 'path'
import { fileURLToPath } from 'url'

import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig, Config } from 'payload'
// import sharp from 'sharp' // DISABLED: Incompatible with Cloudflare Workers - TODO: Migrate to Cloudflare Images (Phase 6)
import { GetPlatformProxyOptions } from 'wrangler'

import { adminOnlyAccess, permissionBasedAccess } from '@/lib/accessControl'
import { resendAdapter } from '@/lib/email/resendAdapter'
import { LOCALES, DEFAULT_LOCALE } from '@/lib/locales'

import { collections, Managers } from './collections'
import { globals } from './globals'
import { tasks } from './jobs'
import { storagePlugin } from './lib/storage'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const isTestEnvironment = process.env.NODE_ENV === 'test'
const isProduction = process.env.NODE_ENV === 'production'
const isDevelopment = process.env.NODE_ENV === 'development'

// Get Cloudflare context using Wrangler for local dev, or real bindings for production
const cloudflareRemoteBindings = process.env.NODE_ENV === 'production'
const cloudflare =
  process.argv.find((value) => value.match(/^(generate|migrate):?/)) || !cloudflareRemoteBindings
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

const payloadConfig = (overrides?: Partial<Config>) => {
  return buildConfig({
    serverURL: process.env.SAHAJCLOUD_URL || 'http://localhost:3000',
    localization: {
      locales: LOCALES.map((l) => l.code),
      defaultLocale: DEFAULT_LOCALE,
    },
    cors: [
      process.env.SAHAJCLOUD_URL || 'http://localhost:3000',
      process.env.WEMEDITATE_WEB_URL || 'http://localhost:5173',
      process.env.SAHAJATLAS_URL || 'http://localhost:5174',
    ],
    csrf: [
      process.env.SAHAJCLOUD_URL || 'http://localhost:3000',
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
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
    db: sqliteD1Adapter({ binding: cloudflare.env.D1 }),
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
    // Email configuration
    // - Test: Disabled to avoid model conflicts
    // - Production: Resend API for transactional emails
    // - Development: Ethereal Email for testing (automatic test email service)
    ...(isTestEnvironment
      ? {}
      : {
          email: isProduction
            ? resendAdapter()
            : nodemailerAdapter({
                defaultFromAddress: 'dev@wemeditate.com',
                defaultFromName: 'We Meditate Admin (Dev)',
                // No transportOptions - uses Ethereal Email in development
              }),
        }),
    // sharp, // DISABLED: Incompatible with Cloudflare Workers - TODO: Migrate to Cloudflare Images (Phase 6)
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

// Adapted from PayloadCMS official template
// https://github.com/payloadcms/payload/blob/main/templates/with-cloudflare-d1/src/payload.config.ts
function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        experimental: { remoteBindings: cloudflareRemoteBindings },
      } as GetPlatformProxyOptions),
  )
}

export { payloadConfig }
export default payloadConfig()
