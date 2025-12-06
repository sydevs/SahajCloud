/**
 * Sentry Integration for PayloadCMS with Cloudflare Workers
 *
 * This module provides Sentry error tracking that works with Cloudflare Workers.
 *
 * Server-side: Uses the sentryPlugin with @sentry/cloudflare
 * Client-side: Uses @sentry/react initialized in src/instrumentation-client.ts
 *
 * @example Server-side (payload.config.ts):
 * ```ts
 * import { sentryPlugin } from '@/lib/sentry'
 *
 * export default buildConfig({
 *   plugins: [sentryPlugin()],
 * })
 * ```
 */
export { sentryPlugin, type SentryPluginOptions } from './plugin'
