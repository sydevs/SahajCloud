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

// Support LOG_LEVEL environment variable for production debugging
// Valid values: 'debug', 'info', 'warn', 'error', 'silent'
// Default: 'silent' in production, 'debug' in development/test
const getLogLevel = (): string => {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL.toLowerCase()
  if (isDevelopment || isTest) return 'debug'
  return 'silent'
}

const logLevel = getLogLevel()
const shouldLog = (level: 'debug' | 'info' | 'warn' | 'error'): boolean => {
  const levels = ['debug', 'info', 'warn', 'error', 'silent']
  const currentLevel = levels.indexOf(logLevel)
  const requestedLevel = levels.indexOf(level)
  return requestedLevel >= currentLevel && currentLevel < levels.indexOf('silent')
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
   * Log debug information
   * Use for detailed debugging information
   *
   * @param message - Debug message
   * @param extra - Additional context
   */
  debug(message: string, extra?: LogContext) {
    if (shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, this.mergeContext(extra))
    }
  }

  /**
   * Log informational messages
   * Controlled by LOG_LEVEL environment variable
   *
   * @param message - Info message
   * @param extra - Additional context
   */
  info(message: string, extra?: LogContext) {
    if (shouldLog('info')) {
      console.info(`[INFO] ${message}`, this.mergeContext(extra))
    }
  }

  /**
   * Log warning messages
   * Controlled by LOG_LEVEL environment variable
   *
   * @param message - Warning message
   * @param extra - Additional context
   */
  warn(message: string, extra?: LogContext) {
    if (shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, this.mergeContext(extra))
    }
  }

  /**
   * Log error messages with optional Error object
   * Controlled by LOG_LEVEL environment variable
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

    if (shouldLog('error')) {
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

    if (shouldLog('error')) {
      console.error(`[FATAL] ${message}`, error, context)

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
