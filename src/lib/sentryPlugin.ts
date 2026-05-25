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
import type { AfterErrorHookArgs, Config, PayloadRequest } from 'payload'

import * as Sentry from '@sentry/cloudflare'

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

const MAX_SENTRY_BODY_BYTES = 10_000

const HTTP_METHOD_TO_OPERATION: Record<string, string> = {
  DELETE: 'delete',
  GET: 'read',
  PATCH: 'update',
  POST: 'create',
  PUT: 'update',
}

/**
 * Per-collection tag overrides — collections listed here get an extra
 * `issue` tag so Sentry searches that look for the open ticket also pick
 * up uncaught errors from the user-facing PATCH path (not just the
 * breadcrumbs already emitted from `reportMeditationNodeWeightsCacheError`).
 */
const COLLECTION_ISSUE_TAGS: Record<string, string> = {
  meditations: '390',
}

const extractOperation = (req: PayloadRequest): string | undefined => {
  if (!req.method) return undefined
  return HTTP_METHOD_TO_OPERATION[req.method.toUpperCase()] ?? req.method.toLowerCase()
}

const extractDocumentId = (req: PayloadRequest): string | undefined => {
  const routeId = req.routeParams?.id
  if (typeof routeId === 'string' || typeof routeId === 'number') {
    return String(routeId)
  }

  const pathname = typeof req.pathname === 'string' ? req.pathname : undefined
  if (!pathname) return undefined

  // Match /api/<collection>/<id> — id is the last segment, alphanumeric or digit.
  // Skip /api/<collection> with no id, and skip nested subroutes like
  // /api/<collection>/<id>/versions which would otherwise grab 'versions'.
  const match = pathname.match(/\/api\/[^/]+\/([^/?#]+)\/?$/)
  if (!match) return undefined
  const candidate = match[1]
  // Skip well-known subroutes that aren't doc IDs.
  if (candidate === 'count' || candidate === 'access' || candidate === 'me') return undefined
  return candidate
}

const truncateRequestBody = (data: unknown): { bytes: number; preview: string } | undefined => {
  if (data === undefined || data === null) return undefined
  let serialized: string
  try {
    serialized = JSON.stringify(data)
  } catch {
    serialized = '[unserializable]'
  }
  if (!serialized) return undefined
  const bytes = serialized.length
  const preview =
    bytes > MAX_SENTRY_BODY_BYTES
      ? `${serialized.slice(0, MAX_SENTRY_BODY_BYTES)}…[truncated ${bytes - MAX_SENTRY_BODY_BYTES} bytes]`
      : serialized
  return { bytes, preview }
}

/**
 * Build the default Sentry context for an afterError event. Exposed for
 * direct unit/integration testing — the inline hook below just wires it
 * through `Sentry.withScope` + the optional caller-supplied `context`.
 */
export const buildDefaultSentryContext = (
  args: AfterErrorHookArgs,
  status: number,
): SentryContext => {
  const { req } = args
  const collectionSlug = args.collection?.slug
  const operation = extractOperation(req)
  const documentId = extractDocumentId(req)
  const body = truncateRequestBody(req.data)
  const issueTag = collectionSlug ? COLLECTION_ISSUE_TAGS[collectionSlug] : undefined

  return {
    user: req.user
      ? {
          id: String(req.user.id),
          email: 'email' in req.user ? String(req.user.email) : undefined,
        }
      : undefined,
    tags: {
      environment: process.env.NODE_ENV,
      locale: req.locale,
      collection: collectionSlug,
      operation,
      issue: issueTag,
    },
    extra: {
      status,
      url: req.url,
      method: req.method,
      documentId,
      requestBodyBytes: body?.bytes,
      requestBody: body?.preview,
    },
    level: status >= 500 ? 'error' : 'warning',
  }
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
            const status =
              'status' in error && typeof error.status === 'number' ? error.status : 500

            // Capture 500+ errors and any explicitly configured status codes
            if (status >= 500 || captureErrors.includes(status)) {
              const defaultContext = buildDefaultSentryContext(args, status)

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
