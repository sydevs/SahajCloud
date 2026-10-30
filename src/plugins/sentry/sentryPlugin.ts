/**
 * Custom Sentry Plugin for PayloadCMS
 *
 * Provides Sentry error capture for Payload CMS operations via an afterError hook.
 * Uses @sentry/nextjs (the app runs on a long-lived Node server).
 *
 * Based on the official @payloadcms/plugin-sentry.
 *
 * ⚠ `afterError` is invoked from `routeError` alone, so it sees only failures a
 * routed request answers with. A Local API write the admin makes while a page
 * renders is caught inside `node_modules` and reaches it never — `onInit`
 * installs the second capture site for those (#1039).
 *
 * @see https://payloadcms.com/docs/plugins/sentry
 */
import type { Config } from 'payload'

import { serverEnv } from '@/lib/env'

import { captureFailure, errorStatus } from './captureFailure'
import { installJobCapture } from './jobCapture'
import { installLocalApiCapture } from './localApiCapture'

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
 *     }),
 *   ],
 * })
 * ```
 */
export const sentryPlugin = (options: SentryPluginOptions = {}) => {
  const { captureErrors = [], debug = false, enabled = true } = options

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

            const status = errorStatus(error)

            // Capture 500+ errors and any explicitly configured status codes
            if (status < 500 && !captureErrors.includes(status)) {
              return
            }

            const collection = args.collection?.slug
            const captured = captureFailure({
              collection,
              error,
              req,
              source: 'afterError',
              status,
            })

            // Debug logging
            if (debug && captured) {
              req.payload.logger.info({
                msg: 'Sentry captured exception',
                error: error.message,
                status,
                collection,
              })
            }
          },
        ],
      },
      onInit: async (payload) => {
        // Before the config's own `onInit`, so every write that follows is
        // covered — including whatever that hook does.
        installLocalApiCapture(payload)
        installJobCapture(payload)
        await config.onInit?.(payload)
      },
    }
  }
}
