/**
 * Minimal client-side logging utility
 *
 * For use in React client components that don't have access to Payload's logger.
 * Logs to console in development, captures errors via Sentry in production.
 *
 * Note: For server-side code, use `payload.logger` instead.
 *
 * @example
 * ```tsx
 * 'use client'
 * import { clientLogger } from '@/lib/clientLogger'
 *
 * clientLogger.error('Upload failed', error, { component: 'FileUploader' })
 * ```
 */
import * as Sentry from '@sentry/react'

type LogContext = Record<string, unknown>

const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'

/**
 * Client-side logger for React components
 *
 * - Development/Test: Logs to console
 * - Production: Silent except for errors (captured by Sentry)
 */
export const clientLogger = {
  /**
   * Log debug information (development only)
   */
  debug(message: string, context?: LogContext) {
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(`[DEBUG] ${message}`, context ?? '')
    }
  },

  /**
   * Log informational messages (development only)
   */
  info(message: string, context?: LogContext) {
    if (isDevelopment || isTest) {
      // eslint-disable-next-line no-console
      console.info(`[INFO] ${message}`, context ?? '')
    }
  },

  /**
   * Log warnings (development only)
   */
  warn(message: string, context?: LogContext) {
    if (isDevelopment || isTest) {
      // eslint-disable-next-line no-console
      console.warn(`[WARN] ${message}`, context ?? '')
    }
  },

  /**
   * Log errors - captured by Sentry in production
   */
  error(message: string, error?: Error | unknown, context?: LogContext) {
    if (isDevelopment || isTest) {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] ${message}`, error, context ?? '')
    } else {
      // Production: capture with Sentry
      const errorToCapture = error instanceof Error ? error : new Error(message)

      Sentry.captureException(errorToCapture, {
        level: 'error',
        extra: {
          ...context,
          originalMessage: message,
        },
      })
    }
  },
}
