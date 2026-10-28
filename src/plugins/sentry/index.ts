/**
 * Sentry Plugin
 *
 * Server-side error tracking for Payload operations via @sentry/nextjs.
 *
 * @example
 * ```typescript
 * import { sentryPlugin } from '@/plugins/sentry'
 *
 * plugins: [
 *   sentryPlugin({ enabled: true }),
 * ]
 * ```
 *
 * ⚠ `captureFailure` and `payloadRouteScope` are deliberately **not** here.
 * Their callers — a server action and the generated REST route — import them by
 * deep path, so neither pulls the plugin, its env parse, or the Local API
 * wrapper in behind it.
 */

export { sentryPlugin } from './sentryPlugin'
export type { SentryPluginOptions } from './sentryPlugin'
