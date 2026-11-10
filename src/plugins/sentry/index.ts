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
 * ⚠ Neither `capture` nor `captureFailure` is here. `captureFailure`'s callers
 * outside this folder — the managers sign-in action and the magic-link endpoint
 * — and every caller of `capture` import by deep path, so they do not pull the
 * plugin, its env parse, or the Local API wrapper in behind them.
 */

export { sentryPlugin } from './sentryPlugin'
export type { SentryPluginOptions } from './sentryPlugin'
