/**
 * Custom Sentry Plugin for PayloadCMS with Cloudflare Workers Support
 *
 * This plugin provides Sentry error capture for Payload CMS operations.
 * Uses @sentry/cloudflare instead of @sentry/nextjs for Cloudflare Workers compatibility.
 *
 * Based on the official @payloadcms/plugin-sentry but adapted for edge runtime.
 *
 * @see https://payloadcms.com/docs/plugins/sentry
 */
import type { Config, PayloadRequest } from 'payload'

import * as Sentry from '@sentry/cloudflare'

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
  context?: (args: {
    defaultContext: SentryContext
    req: PayloadRequest
  }) => Partial<SentryContext>

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
 * import { sentryPlugin } from '@/lib/sentryPlugin'
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
    if (!enabled || !process.env.NEXT_PUBLIC_SENTRY_DSN) {
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
