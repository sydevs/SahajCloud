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
 * ⚠ `captureFailure` is deliberately **not** here. Its one caller outside this
 * folder is the managers sign-in action, which imports it by deep path so it
 * does not pull the plugin, its env parse, or the Local API wrapper in behind
 * it.
 */

export { sentryPlugin } from './sentryPlugin'
export type { SentryPluginOptions } from './sentryPlugin'
