/**
 * Custom Sentry Plugin for PayloadCMS
 *
 * Provides Sentry error capture for Payload CMS operations via an afterError hook.
 * Uses @sentry/nextjs (the app runs on a long-lived Node server).
 *
 * Based on the official @payloadcms/plugin-sentry.
 *
 * @see https://payloadcms.com/docs/plugins/sentry
 */
import type { Config, PayloadRequest } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { mapPostgresCastError } from '@/lib/databaseErrors'
import { serverEnv } from '@/lib/env'

/**
 * Context object for Sentry error capture
 */
interface SentryContext {
  user?: {
    id?: string
    email?: string
  }
  tags?: Record<string, string | undefined>
  extra?: Record<string, unknown>
  level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'
}

export interface SentryPluginOptions {
  /**
   * Array of additional HTTP status codes to capture (500+ are always captured)
   * @example [400, 403, 404]
   */
  captureErrors?: number[]

  /**
   * Enable debug logging of captured exceptions
   * @default false
   */
  debug?: boolean

  /**
   * Custom context function to enrich Sentry error context
   */
  context?: (args: { defaultContext: SentryContext; req: PayloadRequest }) => Partial<SentryContext>

  /**
   * Enable/disable the plugin
   * @default true
   */
  enabled?: boolean
}

/**
 * Create a Sentry plugin for PayloadCMS with Cloudflare Workers support
 *
 * @param options - Plugin configuration options
 * @returns Payload plugin configuration
 *
 * @example
 * ```ts
 * import { sentryPlugin } from '@/plugins/sentry'
 *
 * export default buildConfig({
 *   plugins: [
 *     sentryPlugin({
 *       captureErrors: [400, 403, 404],
 *       debug: process.env.NODE_ENV !== 'production',
 *       context: ({ defaultContext, req }) => ({
 *         ...defaultContext,
 *         tags: {
 *           ...defaultContext.tags,
 *           locale: req.locale,
 *         },
 *       }),
 *     }),
 *   ],
 * })
 * ```
 */
export const sentryPlugin = (options: SentryPluginOptions = {}) => {
  const { captureErrors = [], debug = false, context, enabled = true } = options

  return (config: Config): Config => {
    // Skip plugin if disabled or no DSN configured
    if (!enabled || !serverEnv.NEXT_PUBLIC_SENTRY_DSN) {
      return config
    }

    return {
      ...config,
      hooks: {
        ...config.hooks,
        afterError: [
          ...(config.hooks?.afterError ?? []),
          async (args) => {
            const { error, req } = args

            // A Postgres cast failure is the caller sending a value the column cannot
            // hold, so it is a 400 rather than an incident. `captureErrors` includes 400,
            // so restatusing alone would not stop the report — and asking the same pure
            // predicate rather than reading a flag the other hook sets keeps this
            // independent of the order the two plugins are registered in.
            //
            // ⚠ **This suppresses a 22P02 OUR code composed too**, not only a caller's.
            // Do not try to discriminate on `req.user`: access control denies an
            // anonymous read before any SQL runs, so it is set on every error that
            // reaches here. `docs/architecture.md` has the trade. (sydevs/SahajCloud#670)
            if (mapPostgresCastError(error)) {
              return
            }

            const status =
              'status' in error && typeof error.status === 'number' ? error.status : 500

            // Capture 500+ errors and any explicitly configured status codes
            if (status >= 500 || captureErrors.includes(status)) {
              const defaultContext: SentryContext = {
                user: req.user
                  ? {
                      id: String(req.user.id),
                      email: 'email' in req.user ? String(req.user.email) : undefined,
                    }
                  : undefined,
                tags: {
                  environment: process.env.NODE_ENV,
                  locale: req.locale,
                  collection: 'collection' in args ? String(args.collection?.slug) : undefined,
                },
                extra: {
                  status,
                  url: req.url,
                },
                level: status >= 500 ? 'error' : 'warning',
              }

              // Apply custom context if provided
              const finalContext = context ? context({ defaultContext, req }) : defaultContext

              // Capture the exception with scope
              Sentry.withScope((scope) => {
                if (finalContext.user) {
                  scope.setUser(finalContext.user)
                }
                if (finalContext.tags) {
                  Object.entries(finalContext.tags).forEach(([key, value]) => {
                    if (value) scope.setTag(key, value)
                  })
                }
                if (finalContext.extra) {
                  Object.entries(finalContext.extra).forEach(([key, value]) => {
                    scope.setExtra(key, value)
                  })
                }
                if (finalContext.level) {
                  scope.setLevel(finalContext.level)
                }
                Sentry.captureException(error)
              })

              // Debug logging
              if (debug) {
                req.payload.logger.info({
                  msg: 'Sentry captured exception',
                  error: error.message,
                  status,
                  collection: finalContext.tags?.collection,
                })
              }
            }
          },
        ],
      },
    }
  }
}
