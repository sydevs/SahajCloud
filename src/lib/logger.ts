/**
 * Centralized logging utility
 *
 * Features:
 * - Environment-aware logging (console in dev, throws in production)
 * - Structured logging with context
 * - Type-safe log levels
 * - Contextual logger instances
 *
 * Production Behavior:
 * - logger.error() throws the error to be caught by ErrorBoundary/Sentry instrumentation
 * - This ensures all logged errors are captured by Sentry in production
 * - Other log levels (info, warn, debug) are silent in production
 *
 * @example
 * import { logger } from '@/lib/logger'
 *
 * logger.info('User logged in', { userId: '123' })
 * logger.error('Failed to save', error, { collection: 'pages' }) // Throws in production
 */

type LogContext = Record<string, unknown>

const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'

/**
 * Logger class for structured logging
 * Errors are thrown in production to be caught by Sentry
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
       
      console.log(`[DEBUG] ${message}`, this.mergeContext(extra))
    }
  }

  /**
   * Log informational messages
   * Visible in development console
   *
   * @param message - Info message
   * @param extra - Additional context
   */
  info(message: string, extra?: LogContext) {
    if (isDevelopment || isTest) {
      console.info(`[INFO] ${message}`, this.mergeContext(extra))
    }
  }

  /**
   * Log warning messages
   * Visible in development console
   *
   * @param message - Warning message
   * @param extra - Additional context
   */
  warn(message: string, extra?: LogContext) {
    if (isDevelopment || isTest) {
      console.warn(`[WARN] ${message}`, this.mergeContext(extra))
    }
  }

  /**
   * Log error messages with optional Error object
   * In development/test: logs to console
   * In production: throws error to be caught by ErrorBoundary/Sentry
   *
   * @param message - Error message
   * @param error - Optional Error object
   * @param extra - Additional context
   */
  error(message: string, error?: Error | unknown, extra?: LogContext) {
    const context = this.mergeContext(extra)

    if (isDevelopment || isTest) {
      console.error(`[ERROR] ${message}`, error, context)
    } else {
      // In production, throw the error so it gets caught by ErrorBoundary/Sentry
      // If an Error object was provided, use it; otherwise create a new Error
      const errorToThrow = error instanceof Error ? error : new Error(message)

      // Attach context to the error object for Sentry
      if (Object.keys(context).length > 0) {
        Object.assign(errorToThrow, { loggerContext: context })
      }

      throw errorToThrow
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
