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
 * import { clientLogger } from '@/lib/logger/clientLogger'
 *
 * clientLogger.error('Upload failed', error, { component: 'FileUploader' })
 * ```
 */
// ⚠ `@sentry/nextjs`, never `@sentry/react` — see `src/components/ErrorBoundary.tsx`.
import * as Sentry from '@sentry/nextjs'

import { LOG_LEVELS, type LogLevel } from '@/lib/env/logLevels'

type LogContext = Record<string, unknown>

// ⚠ A literal member expression — the only form Next substitutes (#760, and
// `src/AGENTS.md`). Read any other way, this logger stays 'silent' forever.
const rawLevel = process.env.NEXT_PUBLIC_LOG_LEVEL

// `-1` — unset, or a value the server would have rejected at boot — clamps to
// index 0, which is 'silent'.
const currentLevelIndex = Math.max(0, LOG_LEVELS.indexOf(rawLevel as LogLevel))

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
