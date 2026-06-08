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
 */

export { sentryPlugin } from './sentryPlugin'
export type { SentryPluginOptions } from './sentryPlugin'
