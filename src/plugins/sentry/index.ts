/**
 * Sentry Plugin
 *
 * Cloudflare Workers-compatible error tracking via @sentry/cloudflare.
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
