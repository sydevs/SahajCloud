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

import { serverEnv } from '@/lib/env'
import { buildPayloadLocales, DEFAULT_LOCALE } from '@/lib/locales'
import { createWorkerSafeLogger } from '@/lib/logger/workerSafeLogger'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { accessPlugin, bypassPermissions, filterAvailableLocales } from '@/plugins/access'
import { resendAdapter } from '@/plugins/email'
import { openapiEndpointAuth, scalarPlugin } from '@/plugins/openapi'
import { sentryPlugin } from '@/plugins/sentry'
import { storagePlugin } from '@/plugins/storage'
import { usagePlugin } from '@/plugins/usage'

import { collections, Managers } from './collections'
import { globals } from './globals'
import { tasks } from './jobs'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const isTestEnvironment = process.env.NODE_ENV === 'test'
const isE2ETest = process.env.E2E_TEST === 'true'
const isProduction = process.env.NODE_ENV === 'production'
const isCLI = process.argv.some((value) => value.match(/^(generate|migrate):?/))
const isSeedScript = process.argv.some((value) => value.includes('seeds/'))

// Get Cloudflare context (following PayloadCMS official template pattern)
// Development/CLI: Use wrangler's getPlatformProxy for local/remote bindings
// Production Build: Use OpenNext's getCloudflareContext for build-time bindings
// Seed scripts: Use wrangler proxy with remote bindings when CLOUDFLARE_ENV !== 'dev'
// E2E Tests: Skip Cloudflare context entirely (uses SQLite file database)
const cloudflare = isE2ETest
  ? (null as unknown as CloudflareContext) // E2E tests use SQLite, not D1
  : isCLI || isSeedScript || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

// E2E test database path (file-based SQLite for persistence)
const E2E_DATABASE_PATH = path.resolve(dirname, '../tests/.e2e.sqlite')

const payloadConfig = (overrides?: Partial<Config>) => {
  const serverUrl = getServerUrl()
  const logger = createWorkerSafeLogger(serverEnv.NEXT_PUBLIC_LOG_LEVEL ?? 'info')

  return buildConfig({
    serverURL: serverUrl,
    debug: true, // Enable verbose error logging for troubleshooting R2 uploads
    // Use one logger implementation everywhere so local, CLI, and Worker behavior stay aligned.
    logger,
    localization: {
      defaultLocalePublishOption: 'active',
      locales: buildPayloadLocales(),
      defaultLocale: DEFAULT_LOCALE,
      filterAvailableLocales,
    },
    cors: [serverUrl, serverEnv.WEMEDITATE_WEB_URL, serverEnv.SAHAJATLAS_URL],
    csrf: [serverUrl, serverEnv.WEMEDITATE_WEB_URL, serverEnv.SAHAJATLAS_URL],
    admin: {
      user: Managers.slug,
      importMap: {
        baseDir: path.resolve(dirname),
      },
      meta: {
        titleSuffix: '- Sahaj Cloud',
        description: 'Content for We Meditate & Sahaj Atlas',
        icons: [
          {
            rel: 'icon',
            type: 'image/svg+xml',
            url: '/images/sahaj-cloud.svg',
          },
        ],
      },
      components: {
        providers: [
          {
            path: '@/components/AdminProvider.tsx',
          },
        ],
        beforeNavLinks: ['@/components/admin/ProjectSelector', '@/components/admin/AdminNavLinks'],
        beforeDashboard: [
          '@/components/admin/Dashboard/InactiveAccountAlert',
          '@/components/admin/Dashboard/ProjectSelectionPrompt',
        ],
        graphics: {
          Logo: '@/components/branding/Logo',
          Icon: '@/components/branding/Icon',
        },
        views: {
          analytics: {
            Component: '@/components/admin/AnalyticsView',
            path: '/analytics',
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
    // GraphQL is disabled — this project exposes a REST-only API (see
    // src/app/(payload)/api/[[...slug]]/route.ts for the REST handler).
    // Disabling here keeps the GraphQL schema-building cost out of Payload's
    // bootstrap and lets us avoid bundling @payloadcms/graphql / graphql
    // into the Cloudflare Worker.
    graphQL: { disable: true },
    secret: serverEnv.PAYLOAD_SECRET,
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
      : sqliteD1Adapter({
          binding: cloudflare.env.D1,
          // Disable Drizzle push in all D1 environments. Push silently skips
          // SQLite ALTER TABLE rebuilds needed for polymorphic-FK renames
          // (see issue #291 / #292 fallout), which caused production/dev
          // drift. Local dev now goes through the same migration files as
          // production: `pnpm payload migrate` before first dev start.
          push: false,
        }),
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
    // Email configuration
    // - Test/Import/E2E: Disabled to avoid model conflicts and external service dependencies
    // - Production: Resend API for transactional emails
    // - Development: Ethereal Email for testing (automatic test email service)
    ...(isTestEnvironment || isSeedScript || isE2ETest
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
    // All plugins use `enabled` attribute for conditional loading based on environment
    plugins: [
      // OpenAPI spec generation (disabled in E2E tests)
      openapi({
        openapiVersion: '3.1',
        specEndpoint: '/openapi-raw.json', // Raw spec, filtered version at /openapi.json
        metadata: {
          title: 'Sahaj Cloud API',
          version: '1.0.0',
          description: `REST API for Sahaj Cloud CMS - We Meditate content management.`,
        },
        enabled: !isE2ETest, // Skip in E2E tests
      }),
      openapiEndpointAuth({
        path: '/openapi-raw.json',
        enabled: !isE2ETest,
      }),
      // Scalar API documentation UI (disabled in E2E tests)
      scalarPlugin({
        specEndpoint: '/openapi.json', // Uses our filtered spec (not raw)
        docsUrl: '/docs',
        enabled: !isE2ETest, // Skip in E2E tests
      }),
      // Sentry error tracking (disabled in E2E tests)
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
        enabled: !isE2ETest, // Skip in E2E tests
      }),
      // Cloudflare-native file storage (disabled in E2E tests)
      storagePlugin({
        env: cloudflare?.env,
        enabled: !isE2ETest, // Skip in E2E tests - requires Cloudflare bindings
      }),
      // SEO plugin (enabled in all environments)
      seoPlugin({
        collections: ['pages'],
        uploadsCollection: 'images',
        generateTitle: ({ doc }) => `We Meditate — ${doc.title}`,
        generateDescription: ({ doc }) => doc.content,
        tabbedUI: true,
      }),
      // Form builder plugin (enabled in all environments)
      formBuilderPlugin({
        defaultToEmail: 'contact@sydevelopers.com',
        formOverrides: {
          admin: { group: 'Content', enableRichTextRelationship: true },
        },
        formSubmissionOverrides: {
          admin: { group: 'System' },
        },
      }),
      // Usage Plugin: Rate limiting and usage tracking (disabled in E2E tests)
      // Note: 'clients' is auto-excluded as a consumer collection; 'managers' excluded to skip admin users
      usagePlugin({ enabled: !isE2ETest, exclude: ['managers'] }),
      // Access Plugin: Unified RBAC and project visibility (must be LAST to process plugin-created collections)
      accessPlugin({
        enabled: true,
        bypassPermissions,
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
  const targetProduction = isProduction || (isSeedScript && serverEnv.CLOUDFLARE_ENV !== 'dev')
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: serverEnv.CLOUDFLARE_ENV || undefined,
        remoteBindings: targetProduction,
      } satisfies GetPlatformProxyOptions),
  )
}

export { payloadConfig }
export default payloadConfig()
