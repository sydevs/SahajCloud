/**
 * Centralized logging utility with Sentry integration
 *
 * Features:
 * - Environment-aware logging (console in dev, Sentry in production)
 * - Structured logging with context
 * - Type-safe log levels
 * - Contextual logger instances
 *
 * @example
 * import { logger } from '@/lib/logger'
 *
 * logger.info('User logged in', { userId: '123' })
 * logger.error('Failed to save', error, { collection: 'pages' })
 */

import * as Sentry from '@sentry/nextjs'

type LogContext = Record<string, unknown>

const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'

/**
 * Logger class for structured logging with Sentry integration
 */
class Logger {
  private context?: LogContext

  constructor(context?: LogContext) {
    this.context = context
  }

  /**
   * Log debug information (only visible in development)
   * Use for detailed debugging information that shouldn't go to production
   *
   * @param message - Debug message
   * @param extra - Additional context
   */
  debug(message: string, extra?: LogContext) {
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(`[DEBUG] ${message}`, this.mergeContext(extra))
    }
  }

  /**
   * Log informational messages
   * Visible in development console and sent to Sentry in production
   *
   * @param message - Info message
   * @param extra - Additional context
   */
  info(message: string, extra?: LogContext) {
    if (isDevelopment || isTest) {
      // eslint-disable-next-line no-console
      console.info(`[INFO] ${message}`, this.mergeContext(extra))
    }

    // Send to Sentry in production
    Sentry.captureMessage(message, {
      level: 'info',
      contexts: { custom: this.mergeContext(extra) },
    })
  }

  /**
   * Log warning messages
   * Visible in development console and sent to Sentry in production
   *
   * @param message - Warning message
   * @param extra - Additional context
   */
  warn(message: string, extra?: LogContext) {
    if (isDevelopment || isTest) {
      // eslint-disable-next-line no-console
      console.warn(`[WARN] ${message}`, this.mergeContext(extra))
    }

    // Send to Sentry in production
    Sentry.captureMessage(message, {
      level: 'warning',
      contexts: { custom: this.mergeContext(extra) },
    })
  }

  /**
   * Log error messages with optional Error object
   * Visible in development console and sent to Sentry in production
   *
   * @param message - Error message
   * @param error - Optional Error object
   * @param extra - Additional context
   */
  error(message: string, error?: Error | unknown, extra?: LogContext) {
    const context = this.mergeContext(extra)

    if (isDevelopment || isTest) {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] ${message}`, error, context)
    }

    // Send to Sentry in production
    if (error instanceof Error) {
      Sentry.captureException(error, {
        contexts: {
          custom: {
            message,
            ...context,
          },
        },
      })
    } else if (error) {
      // Handle non-Error objects
      Sentry.captureException(new Error(message), {
        contexts: {
          custom: {
            originalError: String(error),
            ...context,
          },
        },
      })
    } else {
      Sentry.captureMessage(message, {
        level: 'error',
        contexts: { custom: context },
      })
    }
  }

  /**
   * Create a new logger instance with additional context
   * Useful for adding consistent context to multiple log statements
   *
   * @param context - Context to merge with existing context
   * @returns New Logger instance with merged context
   *
   * @example
   * const collectionLogger = logger.withContext({ collection: 'pages' })
   * collectionLogger.info('Document created')
   * collectionLogger.error('Failed to update')
   */
  withContext(context: LogContext): Logger {
    return new Logger({ ...this.context, ...context })
  }

  /**
   * Merge instance context with additional context
   */
  private mergeContext(extra?: LogContext): LogContext {
    return { ...this.context, ...extra }
  }
}

/**
 * Default logger instance
 * Use this for general logging throughout the application
 */
export const logger = new Logger()

/**
 * Create a logger with predefined context
 * Useful for domain-specific logging (e.g., per collection, per module)
 *
 * @param context - Context to include with all log messages
 * @returns Logger instance with context
 *
 * @example
 * const mediaLogger = createLogger({ module: 'media-upload' })
 * mediaLogger.info('Starting upload')
 */
export const createLogger = (context: LogContext) => new Logger(context)
