import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLogger, logger } from '@/lib/logger'

describe('Logger', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('logger.error()', () => {
    it('should log to console in test environment', () => {
      const testError = new Error('Test error')
      logger.error('Error occurred', testError, { userId: '123' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] Error occurred',
        testError,
        { userId: '123' },
      )
    })

    it('should not throw in test environment', () => {
      expect(() => {
        logger.error('Non-fatal error', new Error('Test'))
      }).not.toThrow()
    })

    it('should handle error without Error object', () => {
      logger.error('Simple error message')

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] Simple error message', undefined, {})
    })
  })

  describe('logger.fatal()', () => {
    it('should log to console and throw in test environment', () => {
      const testError = new Error('Fatal error')

      expect(() => {
        logger.fatal('Critical error', testError, { system: 'payment' })
      }).toThrow('Fatal error')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[FATAL] Critical error',
        testError,
        { system: 'payment' },
      )
    })

    it('should create Error object if not provided', () => {
      expect(() => {
        logger.fatal('System failure')
      }).toThrow('System failure')
    })

    it('should attach context to thrown error', () => {
      const context = { requestId: 'abc123', userId: '456' }

      try {
        logger.fatal('Context test', undefined, context)
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        if (error instanceof Error) {
          expect((error as any).loggerContext).toEqual(context)
        }
      }
    })
  })

  describe('logger.warn()', () => {
    it('should log warnings in test environment', () => {
      logger.warn('Warning message', { component: 'auth' })

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN] Warning message', {
        component: 'auth',
      })
    })
  })

  describe('logger.info()', () => {
    it('should log info messages in test environment', () => {
      logger.info('Info message', { action: 'login' })

      expect(consoleInfoSpy).toHaveBeenCalledWith('[INFO] Info message', { action: 'login' })
    })
  })

  describe('logger.debug()', () => {
    it('should not log in test environment', () => {
      logger.debug('Debug message')

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('logger.withContext()', () => {
    it('should create logger with additional context', () => {
      const contextLogger = logger.withContext({ module: 'media' })

      contextLogger.error('Upload failed')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] Upload failed',
        undefined,
        { module: 'media' },
      )
    })

    it('should merge context from multiple withContext calls', () => {
      const contextLogger = logger.withContext({ module: 'media' }).withContext({ action: 'upload' })

      contextLogger.error('Failed')

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] Failed', undefined, {
        module: 'media',
        action: 'upload',
      })
    })
  })

  describe('createLogger()', () => {
    it('should create logger with predefined context', () => {
      const mediaLogger = createLogger({ collection: 'media' })

      mediaLogger.error('Upload failed', new Error('Network error'))

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] Upload failed',
        expect.any(Error),
        { collection: 'media' },
      )
    })
  })
})
