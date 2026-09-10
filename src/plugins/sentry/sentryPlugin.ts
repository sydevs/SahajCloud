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
import { deploymentEnvironment } from '@/lib/env/deploymentEnvironment'

import {
  detectRejectedCredential,
  logRejectedCredential,
  rejectedCredentialFingerprint,
  rejectedCredentialTags,
} from './credentialRejection'

/**
 * Context object for Sentry error capture
 */
interface SentryContext {
  user?: {
    id?: string
    email?: string
    /**
     * The client IP. Sentry's own field for it, on purpose — the project's
     * "Prevent Storing of IP Addresses" setting and the SDK's PII scrubbers
     * both act on `user.ip_address` and neither can see an `extra`. Setting it
     * here keeps the org's kill switch working without a redeploy.
     */
    ip_address?: string
  }
  tags?: Record<string, string | undefined>
  extra?: Record<string, unknown>
  level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'
  /**
   * Overrides Sentry's default grouping. Set only where two errors that look
   * alike are different incidents — leave it unset and Sentry groups as usual.
   */
  fingerprint?: string[]
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
              const tags: Record<string, string | undefined> = {
                environment: deploymentEnvironment(),
                locale: req.locale,
                collection: 'collection' in args ? String(args.collection?.slug) : undefined,
              }
              const extra: Record<string, unknown> = { status, url: req.url }
              let level: SentryContext['level'] = status >= 500 ? 'error' : 'warning'
              let fingerprint: string[] | undefined
              let clientIp: string | undefined

              // A presented-and-rejected credential is a broken integration, not
              // traffic — but only below 500. The caller's credential is not what
              // is wrong with a 500, so nothing auth-related is computed there.
              const rejected = status < 500 ? detectRejectedCredential(req) : null

              if (rejected) {
                // ⚠ **Accepted risk: this level is caller-triggerable.** Any
                // anonymous caller can raise a captured 400/403/404 to `error`
                // by sending a junk `Authorization` header. Grouping stays
                // bounded by the collection check, so the cost is event quota
                // and alert noise, never one Sentry issue per value. #734
                // leaves routing to a Sentry-side rule on `auth_outcome`, which
                // is where to mute this — not by dropping the level. (#734)
                level = 'error'
                // ⚠ **The IP belongs on `user.ip_address`, never in an `extra`.**
                // `sendDefaultPii: false` and the project's "Prevent Storing of
                // IP Addresses" setting both act on that field alone; an `extra`
                // is opaque context no scrubber reaches.
                clientIp = rejected.ip
                Object.assign(tags, rejectedCredentialTags(rejected))
                Object.assign(extra, { userAgent: rejected.userAgent })
                fingerprint = rejectedCredentialFingerprint(rejected, status)

                // Deliberately outside the custom `context` function below: that
                // may reshape the report, but the denial itself still happened.
                //
                // ⚠ This plugin returns the config untouched when no
                // `NEXT_PUBLIC_SENTRY_DSN` is set, so a deployment without one
                // gets neither the event nor this line. Every deployed
                // environment sets it; a local run that does not, will not see
                // this. `requireActiveClient`'s path has no such gate (#743).
                logRejectedCredential(req, rejected, { status, source: 'sentryPlugin' })
              }

              // The two arms are mutually exclusive: `clientIp` is set only on
              // the rejected branch, which requires no `req.user`. So a rejected
              // caller's `user` carries the IP alone — the absent `id` is what
              // still says nobody authenticated, and `auth_outcome` says so
              // outright.
              const user = req.user
                ? {
                    id: String(req.user.id),
                    email: 'email' in req.user ? String(req.user.email) : undefined,
                  }
                : clientIp
                  ? { ip_address: clientIp }
                  : undefined

              const defaultContext: SentryContext = {
                user,
                tags,
                extra,
                level,
                fingerprint,
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
                if (finalContext.fingerprint) {
                  scope.setFingerprint(finalContext.fingerprint)
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
