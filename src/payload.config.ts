import path from 'path'
import { fileURLToPath } from 'url'

import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig, Config } from 'payload'
import { openapi } from 'payload-oapi'
import { GetPlatformProxyOptions } from 'wrangler'

import {
  accessPlugin,
  filterAvailableLocales,
  handleProjectVisibility, // Used for formBuilderPlugin overrides
  roleBasedAccess, // Used for formBuilderPlugin overrides
  type AccessPluginOptions,
} from '@/lib/access'
import { resendAdapter } from '@/lib/email/resendAdapter'
import { buildPayloadLocales, DEFAULT_LOCALE } from '@/lib/locales'
import { scalarPlugin } from '@/lib/openapi'
import { sentryPlugin } from '@/lib/sentryPlugin'
import { getServerUrl } from '@/lib/serverUrl'

// Access Plugin Configuration - Single source of truth for RBAC and project visibility
const accessPluginConfig: AccessPluginOptions = {
  projects: {
    'wemeditate-web': {
      collections: [
        'pages',
        'meditations',
        'music',
        'albums',
        'forms',
        'authors',
        'page-tags',
        'meditation-tags',
        'music-tags',
        'narrators',
        'frames',
      ],
      globals: ['we-meditate-web-settings'],
    },
    'wemeditate-app': {
      collections: [
        'meditations',
        'music',
        'albums',
        'lessons',
        'lectures',
        'frames',
        'narrators',
        'meditation-tags',
        'music-tags',
      ],
      globals: ['we-meditate-app-settings'],
    },
    'sahaj-atlas': {
      collections: [],
      globals: ['sahaj-atlas-settings'],
    },
  },
  roles: {
    managers: {
      'meditations-editor': {
        label: 'Meditations Editor',
        description: 'Can create and edit meditations, upload related media and files',
        project: 'wemeditate-app',
        permissions: {
          meditations: ['create', 'update'],
          images: ['create'],
          files: ['create'],
        },
      },
      'path-editor': {
        label: 'Path Editor',
        description: 'Can edit lessons and lectures, upload related media and files',
        project: 'wemeditate-app',
        permissions: {
          lessons: ['update'],
          lectures: ['update'],
          images: ['create'],
          files: ['create'],
        },
      },
      translator: {
        label: 'Translator',
        description: 'Can edit localized fields in pages and music',
        project: 'wemeditate-web',
        permissions: {
          pages: ['translate'],
          music: ['translate'],
        },
      },
    },
    clients: {
      'wemeditate-web': {
        label: 'We Meditate Web',
        description: 'Access for We Meditate web frontend application',
        project: 'wemeditate-web',
        permissions: {
          'we-meditate-web-settings': ['read'],
          meditations: ['read'],
          frames: ['read'],
          narrators: ['read'],
          images: ['read'],
          files: ['read'],
          pages: ['read'],
          music: ['read'],
          albums: ['read'],
          forms: ['read'],
          authors: ['read'],
          'meditation-tags': ['read'],
          'page-tags': ['read'],
          'music-tags': ['read'],
          'form-submissions': ['create'],
        },
      },
      'wemeditate-app': {
        label: 'We Meditate App',
        description: 'Access for We Meditate mobile application',
        project: 'wemeditate-app',
        permissions: {
          'we-meditate-app-settings': ['read'],
          meditations: ['read'],
          frames: ['read'],
          narrators: ['read'],
          lessons: ['read'],
          lectures: ['read'],
          music: ['read'],
          albums: ['read'],
          images: ['read'],
          files: ['read'],
          'meditation-tags': ['read'],
          'page-tags': ['read'],
          'music-tags': ['read'],
        },
      },
      'sahaj-atlas': {
        label: 'Sahaj Atlas',
        description: 'Access for Sahaj Atlas application',
        project: 'sahaj-atlas',
        permissions: {
          'sahaj-atlas-settings': ['read'],
          images: ['read'],
          files: ['read'],
        },
      },
    },
  },
  bypass: {
    managers: ({ user, collection, operation, docId }) => {
      // 1. Inactive manager blocking
      if (user.type === 'inactive') return 'deny'

      // 2. Admin bypass (full access)
      if (user.type === 'admin') return 'allow'

      // 3. customResourceAccess: Allow update for specific documents
      if (operation === 'update' && docId && user.customResourceAccess?.length) {
        const hasAccess = user.customResourceAccess.some(
          (access) => access.relationTo === collection && String(access.value) === String(docId),
        )
        if (hasAccess) return 'allow'
      }
      return 'continue'
    },
    clients: ({ user }) => {
      // 1. Inactive client blocking
      if (!user.active) return 'deny'

      return 'continue'
    },
  },
}

import { collections, Managers } from './collections'
import { globals } from './globals'
import { tasks } from './jobs'
import { storagePlugin } from './lib/storage'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const isTestEnvironment = process.env.NODE_ENV === 'test'
const isE2ETest = process.env.E2E_TEST === 'true'
const isProduction = process.env.NODE_ENV === 'production'
const isCLI = process.argv.some((value) => value.match(/^(generate|migrate):?/))
const isImportScript = process.argv.some((value) => value.includes('imports/'))

// Get Cloudflare context (following PayloadCMS official template pattern)
// Development/CLI: Use wrangler's getPlatformProxy for local/remote bindings
// Production Build: Use OpenNext's getCloudflareContext for build-time bindings
// Import scripts: Use wrangler proxy with remote bindings when CLOUDFLARE_ENV !== 'dev'
// E2E Tests: Skip Cloudflare context entirely (uses SQLite file database)
const cloudflare = isE2ETest
  ? (null as unknown as CloudflareContext) // E2E tests use SQLite, not D1
  : isCLI || isImportScript || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

// E2E test database path (file-based SQLite for persistence)
const E2E_DATABASE_PATH = path.resolve(dirname, '../tests/.e2e.sqlite')

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
      defaultLocalePublishOption: 'active',
      locales: buildPayloadLocales(),
      defaultLocale: DEFAULT_LOCALE,
      filterAvailableLocales,
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
      // Disable admin UI in unit test environment (but enable for E2E tests)
      disable: isTestEnvironment && !isE2ETest,
      // Disable auto-login for E2E tests (tests need to authenticate manually)
      autoLogin: !isProduction && !isE2ETest ? { email: 'contact@sydevelopers.com' } : false,
    },
    collections,
    globals,
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || '',
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
    // Database configuration
    // - E2E Tests: File-based SQLite for persistence across dev server lifecycle
    // - All other environments: Cloudflare D1 SQLite
    db: isE2ETest
      ? sqliteAdapter({
          client: {
            url: `file:${E2E_DATABASE_PATH}`,
          },
          push: true, // Auto-sync schema
        })
      : sqliteD1Adapter({ binding: cloudflare.env.D1 }),
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
    // - Test/Import/E2E: Disabled to avoid model conflicts and external service dependencies
    // - Production: Resend API for transactional emails
    // - Development: Ethereal Email for testing (automatic test email service)
    ...(isTestEnvironment || isImportScript || isE2ETest
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
    // Plugins configuration
    // - E2E Tests: Skip Cloudflare-specific plugins (Sentry, Storage) as they require Cloudflare bindings
    // - All other environments: Full plugin suite
    plugins: isE2ETest
      ? [
          // Access Plugin: Unified RBAC and project visibility
          accessPlugin(accessPluginConfig),
          // Only include plugins that don't require Cloudflare bindings for E2E tests
          // Note: openapi/swaggerUI plugins excluded - not needed for E2E testing
          seoPlugin({
            collections: ['pages'],
            uploadsCollection: 'images',
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
                hidden: ({ user }) => {
                  const currentProject = user?.currentProject
                  return currentProject !== 'all-content' && currentProject !== 'wemeditate-web'
                },
                group: 'System',
              },
            },
          }),
        ]
      : [
          // Access Plugin: Unified RBAC and project visibility (must be first to configure access before other plugins)
          accessPlugin(accessPluginConfig),
          openapi({
            openapiVersion: '3.1',
            specEndpoint: '/openapi-raw.json', // Raw spec, filtered version at /openapi.json
            metadata: {
              title: 'Sahaj Cloud API',
              version: '1.0.0',
              description: `REST API for Sahaj Cloud CMS - We Meditate content management.`,
            },
          }),
          scalarPlugin({
            specEndpoint: '/openapi.json', // Uses our filtered spec (not raw)
            docsUrl: '/docs',
          }),
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
// Import scripts can target production by not setting CLOUDFLARE_ENV (or setting it to empty string)
function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  const targetProduction = isProduction || (isImportScript && process.env.CLOUDFLARE_ENV !== 'dev')
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV || undefined,
        remoteBindings: targetProduction,
      } satisfies GetPlatformProxyOptions),
  )
}

export { payloadConfig }
export default payloadConfig()
