import path from 'path'
import { fileURLToPath } from 'url'

import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig, Config } from 'payload'
import { GetPlatformProxyOptions } from 'wrangler'

import { roleBasedAccess } from '@/lib/accessControl'
import { resendAdapter } from '@/lib/email/resendAdapter'
import { LOCALES, DEFAULT_LOCALE } from '@/lib/locales'
import { handleProjectVisibility } from '@/lib/projectVisibility'
import { sentryPlugin } from '@/lib/sentryPlugin'
import { getServerUrl } from '@/lib/serverUrl'

import { collections, Managers } from './collections'
import { globals } from './globals'
import { tasks } from './jobs'
import { storagePlugin } from './lib/storage'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const isTestEnvironment = process.env.NODE_ENV === 'test'
const isProduction = process.env.NODE_ENV === 'production'
const isCLI = process.argv.some((value) => value.match(/^(generate|migrate):?/))
const isImportScript = process.argv.some((value) => value.includes('imports/'))

// Get Cloudflare context (following PayloadCMS official template pattern)
// Development/CLI: Use wrangler's getPlatformProxy for local/remote bindings
// Production Build: Use OpenNext's getCloudflareContext for build-time bindings
const cloudflare =
  isCLI || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

const payloadConfig = (overrides?: Partial<Config>) => {
  const serverUrl = getServerUrl()

  return buildConfig({
    serverURL: serverUrl,
    debug: true, // Enable verbose error logging for troubleshooting R2 uploads
    // Logger configuration - uses Pino under the hood
    // Controlled by NEXT_PUBLIC_LOG_LEVEL: 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
    ...(process.env.NEXT_PUBLIC_LOG_LEVEL && {
      logger: {
        options: {
          level: process.env.NEXT_PUBLIC_LOG_LEVEL,
        },
      },
    }),
    localization: {
      locales: LOCALES.map((l) => l.code),
      defaultLocale: DEFAULT_LOCALE,
    },
    cors: [
      serverUrl,
      process.env.WEMEDITATE_WEB_URL || 'http://localhost:5173',
      process.env.SAHAJATLAS_URL || 'http://localhost:5174',
    ],
    csrf: [
      serverUrl,
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

        // Only visible in all-content mode
        defaultJobsCollection.admin.hidden = ({ user }) => {
          const currentProject = user?.currentProject
          return currentProject !== 'all-content' || user?.type !== 'admin'
        }
        defaultJobsCollection.access = roleBasedAccess('payload-jobs', { implicitRead: false })
        return defaultJobsCollection
      },
    },
    // Email configuration
    // - Test/Import: Disabled to avoid model conflicts and external service dependencies
    // - Production: Resend API for transactional emails
    // - Development: Ethereal Email for testing (automatic test email service)
    ...(isTestEnvironment || isImportScript
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
    plugins: [
      sentryPlugin({
        captureErrors: [400, 403, 404], // Capture additional error codes
        debug: !isProduction,
        context: ({ defaultContext, req }) => ({
          ...defaultContext,
          tags: {
            ...defaultContext.tags,
            locale: req.locale,
          },
        }),
      }),
      storagePlugin(cloudflare.env as Parameters<typeof storagePlugin>[0]), // Cloudflare-native file storage (Images, Stream, R2)
      seoPlugin({
        collections: ['pages'],
        uploadsCollection: 'images', // Changed from 'media' to 'images'
        generateTitle: ({ doc }) => `We Meditate — ${doc.title}`,
        generateDescription: ({ doc }) => doc.content,
        tabbedUI: true,
      }),
      formBuilderPlugin({
        defaultToEmail: 'contact@sydevelopers.com',
        formOverrides: {
          access: roleBasedAccess('forms'),
          admin: {
            group: 'Resources',
            hidden: handleProjectVisibility('forms', ['wemeditate-web']),
          },
        },
        formSubmissionOverrides: {
          access: roleBasedAccess('form-submissions', { implicitRead: false }),
          admin: {
            // Visible in all-content mode or wemeditate-web project
            hidden: ({ user }) => {
              const currentProject = user?.currentProject
              return currentProject !== 'all-content' && currentProject !== 'wemeditate-web'
            },
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
        remoteBindings: isProduction,
      } satisfies GetPlatformProxyOptions),
  )
}

export { payloadConfig }
export default payloadConfig()
