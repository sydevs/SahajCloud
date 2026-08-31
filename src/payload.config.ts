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

import { REGION_NESTED_DOCS_CONFIG } from '@/lib/atlas/regionTree'
import { CONTACT_EMAIL } from '@/lib/contact'
import { serverEnv } from '@/lib/env'
import { buildPayloadLocales, DEFAULT_LOCALE } from '@/lib/locales'
import { createWorkerSafeLogger } from '@/lib/logger/workerSafeLogger'
import { SUPPORTED_TIMEZONES } from '@/lib/timezones'
import { PREVIEW_SECRET_HEADER } from '@/lib/utilities/previewSecret'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { accessPlugin, bypassPermissions, filterAvailableLocales } from '@/plugins/access'
import { cachePlugin } from '@/plugins/cache'
import { buildSmtpTransportOptions, resendAdapter, warnEmailDisabled } from '@/plugins/email'
import { openapiEndpointAuth, scalarPlugin } from '@/plugins/openapi'
import { seedPreviewAdmin } from '@/plugins/previewAdmin'
import { sentryPlugin } from '@/plugins/sentry'
import { storagePlugin } from '@/plugins/storage'
import { isProductionDeployment } from '@/plugins/storage/previewIsolation'
import { usagePlugin } from '@/plugins/usage'
import { writeGuardPlugin } from '@/plugins/writeGuard'

import { collections, Managers } from './collections'
import { atlasSeo } from './endpoints/atlas/seo'
import { atlasSitemap } from './endpoints/atlas/sitemap'
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
    // Cap relationship-population depth globally. `defaultDepth` (Payload's own
    // default is 2) applies when a request omits `depth`; `maxDepth` (default
    // 10) is the hard ceiling that clamps any explicit `depth` a caller asks
    // for — a guard against runaway edit-view / API over-fetching. The app's
    // own queries never request beyond depth 2, so 3 leaves one level of
    // client headroom. Documented to REST clients as the `depth` param's
    // `maximum` in `@/plugins/openapi/clientReadParametersDocs`. See issue #529.
    defaultDepth: 2,
    maxDepth: 3,
    localization: {
      defaultLocalePublishOption: 'active',
      locales: buildPayloadLocales(),
      defaultLocale: DEFAULT_LOCALE,
      filterAvailableLocales,
    },
    // CORS is intentionally open. Per-client origin enforcement is server-side:
    // `validateClientOriginHook` (usagePlugin) checks each request's Origin/Referer
    // against the client's `allowedDomains`, and the API key gates access. CORS
    // preflight is anonymous — the browser omits Authorization, so the server
    // cannot return a per-client allowlist at preflight time. `origins: '*'` lets
    // embedded Atlas widgets' preflight succeed on any host page; Payload omits
    // Access-Control-Allow-Credentials for `'*'`, so cookie-based admin sessions
    // stay protected (the static `csrf` list below is unchanged). See #509.
    // `headers` APPENDS the live-preview secret to Payload's default allow-list
    // (Authorization etc. stay): the Atlas widget fetches drafts client-side, so
    // the header rides a cross-origin request and must clear preflight. See #575.
    cors: { origins: '*', headers: [PREVIEW_SECRET_HEADER] },
    csrf: [serverUrl, serverEnv.WEMEDITATE_WEB_URL, serverEnv.SAHAJATLAS_URL],
    admin: {
      user: Managers.slug,
      // Widen the timezone picker (and every `timezone: true` companion's enum)
      // to the full IANA set — the Atlas data uses zones beyond Payload's
      // curated default list. Deterministic: see @/lib/timezones.
      timezones: {
        supportedTimezones: SUPPORTED_TIMEZONES,
      },
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
        // Non-admin Atlas managers get a custom sidebar; everyone else falls
        // back to DefaultNav inside the component itself. See AtlasNav.
        Nav: '@/components/admin/AtlasNav/AtlasNav',
        beforeDashboard: ['@/components/admin/Dashboard/ProjectSelectionPrompt'],
        graphics: {
          Logo: '@/components/branding/Logo',
          Icon: '@/components/branding/Icon',
        },
        views: {
          analytics: {
            Component: '@/components/admin/AnalyticsView',
            path: '/analytics',
          },
          map: {
            Component: '@/components/admin/AtlasMapView',
            path: '/map',
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
    // Root-level custom endpoints — for resources that belong to no collection.
    // Everything else is colocated on its owning collection; see
    // `.claude/rules/endpoints.md`. The OpenAPI spec derives its root-path
    // exemption from this array (`rootEndpointPathsFrom`), so registering here
    // is all it takes to keep `/api/docs` honest.
    endpoints: [atlasSeo, atlasSitemap],
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
        // Cap the pool so bursts of parallel admin work (e.g. a bulk publish,
        // whose per-doc queries the driver runs concurrently) can't exhaust the
        // Railway Postgres connection limit. Size to that limit divided across
        // running instances — see the pool-sizing notes in
        // `.claude/docs/architecture.md`. Tune via DATABASE_POOL_MAX.
        max: serverEnv.DATABASE_POOL_MAX,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      },
      push: !isProduction,
      // Drizzle query logging (SQL + params to the console). Opt-in via
      // DB_QUERY_LOGGING and force-disabled in production — used to capture the
      // query trail behind a slow admin operation in dev/staging (issue #529).
      logger: !isProduction && serverEnv.DB_QUERY_LOGGING,
      // Production runs as a long-running container, so apply any pending
      // migrations in-process on boot (Payload only runs these when
      // NODE_ENV=production). Dev/test use Drizzle `push` above instead.
      prodMigrations: migrations,
    }),
    // Reconcile the Railway preview's admin from PREVIEW_ADMIN_PASSWORD, after the
    // migrations above have run. A no-op everywhere else — see the gate's docblock in
    // `@/plugins/previewAdmin` for why each of its three conditions is there, and why
    // production is detected by Railway's environment name rather than NODE_ENV.
    onInit: seedPreviewAdmin,
    jobs: {
      tasks,
      deleteJobOnComplete: true,
      enableConcurrencyControl: true,
      autoRun: [
        {
          cron: '0 * * * *', // Runs every hour
          queue: 'nightly',
        },
        {
          // Safety net for the per-submission screening kick (see
          // EventSubmissions/hooks/enqueueScreening): a submission whose
          // immediate run was lost to a crash waits at most 15 minutes.
          cron: '*/15 * * * *',
          queue: 'screening',
        },
      ],
    },
    // Email configuration
    // - Test/Import/E2E: disabled, to avoid model conflicts and external services.
    // - Canonical production: Resend.
    // - Anywhere else: SMTP to Mailpit when SMTP_URL is set; otherwise disabled.
    //
    // Production is detected with `isProductionDeployment()` (Railway's
    // environment name), NOT `NODE_ENV`. This is the same distinction storage
    // already makes, and for the same reason: **Railway PR previews also run
    // NODE_ENV=production**, so a NODE_ENV check sent preview mail through
    // Resend to real addresses. Previews inherit RESEND_API_KEY from production
    // and are recreated per PR, so this has to hold in code — variable hygiene
    // on individual preview environments would not survive the next PR.
    //
    // There is deliberately no silent fallback transport. Ethereal used to fill
    // that role, but it deletes messages after a few hours, so a preview link in
    // a PR was dead before review. Mail now goes to Resend (production only), to
    // Mailpit (SMTP_URL set), or nowhere at all with a warning.
    ...(isTestEnvironment || isSeedScript || isE2ETest
      ? {}
      : {
          email: isProductionDeployment()
            ? resendAdapter()
            : serverEnv.SMTP_URL
              ? nodemailerAdapter({
                  defaultFromAddress: 'dev@wemeditate.com',
                  defaultFromName: 'We Meditate Admin (Dev)',
                  transportOptions: buildSmtpTransportOptions(serverEnv.SMTP_URL),
                })
              : warnEmailDisabled(),
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
      // Write Guard: anti-spam checks (Turnstile header, URL scan, disposable
      // email) on client-originated writes, per the policy map in
      // src/plugins/writeGuard/policies.ts. It now covers the whole public
      // write surface — the one root endpoint that used to call these helpers
      // by hand became the `user-messages` collection (#632).
      writeGuardPlugin(),
      // Nested docs: adds breadcrumbs + uses the region tree's `parent` field
      // (Country → Region → Area → Center). Registered before accessPlugin so
      // the latter sees the injected fields. `parentFieldSlug: 'parent'` tells
      // the plugin Regions defines its own `parent` (in the Details tab, with
      // a level-based filter) so it doesn't inject a duplicate into the sidebar.
      // Config (including the `generateURL` that makes region paths queryable)
      // lives in REGION_NESTED_DOCS_CONFIG, shared with the test harness — which
      // builds its own config, so a plugin configured in only one of the two
      // behaves differently under test than in production.
      nestedDocsPlugin(REGION_NESTED_DOCS_CONFIG),
      // Edge cache (#555): the unified cachePlugin. This registration attaches
      // the best-effort Cloudflare purge-on-write hooks for the collections that
      // back cached reads (no-op unless CLOUDFLARE_ZONE_ID +
      // CLOUDFLARE_CACHE_PURGE_TOKEN are set — safe to ship ahead of the Cache
      // Rule). Read-header emission lives in `src/middleware.ts` (built-in REST
      // reads) + the `publicReadCacheHeaders` decorator (custom endpoints).
      cachePlugin,
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
