/**
 * Minimal client-side logging utility
 *
 * For use in React client components that don't have access to Payload's logger.
 * Controlled by NEXT_PUBLIC_LOG_LEVEL environment variable.
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
type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

// Log levels in order of verbosity (lower index = less verbose)
const LOG_LEVELS: LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug']

const configuredLevel = (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) || 'silent'
const currentLevelIndex = LOG_LEVELS.indexOf(configuredLevel)

/**
 * Check if a message at the given level should be logged
 */
const shouldLog = (level: LogLevel): boolean => {
  const levelIndex = LOG_LEVELS.indexOf(level)
  return levelIndex <= currentLevelIndex && levelIndex > 0 // Never log 'silent'
}

/**
 * Client-side logger for React components
 *
 * Controlled by NEXT_PUBLIC_LOG_LEVEL: 'silent' | 'error' | 'warn' | 'info' | 'debug'
 * Errors are always captured by Sentry in production regardless of log level.
 */
export const clientLogger = {
  /**
   * Log debug information
   */
  debug(message: string, context?: LogContext) {
    if (shouldLog('debug')) {
      // eslint-disable-next-line no-console
      console.log(`[DEBUG] ${message}`, context ?? '')
    }
  },

  /**
   * Log informational messages
   */
  info(message: string, context?: LogContext) {
    if (shouldLog('info')) {
      // eslint-disable-next-line no-console
      console.info(`[INFO] ${message}`, context ?? '')
    }
  },

  /**
   * Log warnings
   */
  warn(message: string, context?: LogContext) {
    if (shouldLog('warn')) {
      // eslint-disable-next-line no-console
      console.warn(`[WARN] ${message}`, context ?? '')
    }
  },

  /**
   * Log errors - always captured by Sentry in production
   */
  error(message: string, error?: Error | unknown, context?: LogContext) {
    // Always capture errors with Sentry (regardless of log level)
    const errorToCapture = error instanceof Error ? error : new Error(message)
    Sentry.captureException(errorToCapture, {
      level: 'error',
      extra: {
        ...context,
        originalMessage: message,
      },
    })

    // Also log to console if log level allows
    if (shouldLog('error')) {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] ${message}`, error, context ?? '')
    }
  },
}
