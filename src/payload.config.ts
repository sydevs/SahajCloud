import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig, Config } from 'payload'
import { openapi } from 'payload-oapi'

import { CONTACT_EMAIL } from '@/lib/contact'
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
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const isTestEnvironment = process.env.NODE_ENV === 'test'
const isE2ETest = process.env.E2E_TEST === 'true'
const isProduction = process.env.NODE_ENV === 'production'
const isSeedScript = process.argv.some((value) => value.includes('seeds/'))

const payloadConfig = (overrides?: Partial<Config>) => {
  const serverUrl = getServerUrl()
  const logger = createWorkerSafeLogger(serverEnv.NEXT_PUBLIC_LOG_LEVEL ?? 'info')

  return buildConfig({
    serverURL: serverUrl,
    debug: true, // Enable verbose error logging for troubleshooting uploads
    // Use one logger implementation everywhere so local, CLI, and server behavior stay aligned.
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
    // bootstrap and avoids bundling @payloadcms/graphql / graphql into the
    // server bundle.
    graphQL: { disable: true },
    secret: serverEnv.PAYLOAD_SECRET,
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
    // Database configuration — Railway Postgres for every environment.
    // Dev/test/E2E use Drizzle `push` to auto-sync the schema; production runs
    // migrations (`pnpm db:migrate`) instead of push.
    db: postgresAdapter({
      pool: {
        connectionString: serverEnv.DATABASE_URL,
      },
      push: !isProduction,
      // Production runs as a long-running container, so apply any pending
      // migrations in-process on boot (Payload only runs these when
      // NODE_ENV=production). Dev/test use Drizzle `push` above instead.
      prodMigrations: migrations,
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
      // File storage: Cloudflare Images/Stream + R2 over S3 (disabled in E2E tests)
      storagePlugin({
        enabled: !isE2ETest, // Skip in E2E tests
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
        defaultToEmail: CONTACT_EMAIL,
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
      // Nested docs: adds breadcrumbs + uses the region tree's `parent` field
      // (Country → Region → Area → Center). Registered before accessPlugin so
      // the latter sees the injected fields. `parentFieldSlug: 'parent'` tells
      // the plugin Regions defines its own `parent` (in the Details tab, with
      // a level-based filter) so it doesn't inject a duplicate into the sidebar.
      nestedDocsPlugin({
        collections: ['regions'],
        parentFieldSlug: 'parent',
        generateLabel: (_docs, currentDoc) => String(currentDoc?.name ?? ''),
      }),
      // Access Plugin: Unified RBAC and project visibility (must be LAST to process plugin-created collections)
      accessPlugin({
        enabled: true,
        bypassPermissions,
      }),
    ],
    upload: {
      // Per-chunk stall watchdog (NOT total upload time). Payload's default is
      // 60s, which large audio uploads on slow/unstable connections can exceed
      // → unhandled "Upload timeout" rejection (SAHAJCLOUD-40). 5 min gives
      // generous slack. The Railway/Cloudflare hops don't impose this; it's
      // purely Payload's default. See plans/...luminous-dusk.md (Track A).
      uploadTimeout: 300000,
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
