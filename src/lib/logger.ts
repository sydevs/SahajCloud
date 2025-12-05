/**
 * Centralized logging utility
 *
 * Features:
 * - Environment-aware logging (console in dev, Sentry capture in production)
 * - Structured logging with context
 * - Type-safe log levels
 * - Contextual logger instances
 *
 * Production Behavior:
 * - logger.error() captures errors with Sentry but continues execution
 * - logger.fatal() captures errors with Sentry AND throws (crashes the application)
 * - Other log levels (info, warn, debug) are silent in production
 *
 * Use logger.error() for recoverable errors (logging, background jobs, API routes)
 * Use logger.fatal() only when the error should crash the application
 *
 * @example
 * import { logger } from '@/lib/logger'
 *
 * logger.info('User logged in', { userId: '123' })
 * logger.error('Failed to save', error, { collection: 'pages' }) // Logs and continues
 * logger.fatal('Critical system error', error) // Logs and throws
 */

type LogContext = Record<string, unknown>

const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'
const isProduction = process.env.NODE_ENV === 'production'

// Dynamically import Sentry only in production and only when needed
let Sentry: typeof import('@sentry/react') | typeof import('@sentry/cloudflare') | null = null

async function getSentry() {
  if (!isProduction || Sentry) return Sentry

  try {
    // Try to load client-side Sentry first (for browser context)
    if (typeof window !== 'undefined') {
      Sentry = await import('@sentry/react')
    } else {
      // Load server-side Sentry for edge runtime
      Sentry = await import('@sentry/cloudflare')
    }
  } catch (error) {
    console.warn('Failed to load Sentry SDK:', error)
  }

  return Sentry
}

/**
 * Logger class for structured logging with Sentry integration
 * In production, errors are captured by Sentry
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
   * In production: captures with Sentry but continues execution
   *
   * Use this for recoverable errors (API failures, validation errors, etc.)
   * Use logger.fatal() if the error should crash the application
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
      // In production, capture with Sentry but don't throw
      const errorToCapture = error instanceof Error ? error : new Error(message)

      // Attach context to the error object for Sentry
      if (Object.keys(context).length > 0) {
        Object.assign(errorToCapture, { loggerContext: context })
      }

      // Capture asynchronously without blocking
      getSentry().then((sentry) => {
        if (sentry?.captureException) {
          sentry.captureException(errorToCapture, {
            level: 'error',
            extra: context,
          })
        }
      })
    }
  }

  /**
   * Log fatal errors and throw to crash the application
   * In development/test: logs to console and throws
   * In production: captures with Sentry AND throws
   *
   * Use this ONLY for critical errors that should crash the application
   * (e.g., configuration errors, critical system failures)
   *
   * @param message - Fatal error message
   * @param error - Optional Error object
   * @param extra - Additional context
   */
  fatal(message: string, error?: Error | unknown, extra?: LogContext): never {
    const context = this.mergeContext(extra)
    const errorToThrow = error instanceof Error ? error : new Error(message)

    // Attach context to the error object
    if (Object.keys(context).length > 0) {
      Object.assign(errorToThrow, { loggerContext: context })
    }

    if (isDevelopment || isTest) {
      console.error(`[FATAL] ${message}`, error, context)
    } else {
      // In production, capture with Sentry before throwing
      getSentry().then((sentry) => {
        if (sentry?.captureException) {
          sentry.captureException(errorToThrow, {
            level: 'fatal',
            extra: context,
          })
        }
      })
    }

    // Always throw for fatal errors
    throw errorToThrow
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
