/**
 * Import Library Tests
 *
 * Basic tests for the shared import utilities.
 * These tests validate that the utilities function correctly without
 * requiring a full Payload CMS instance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { BaseImporter, type BaseImportOptions, type RunVerification } from './BaseImporter'
import { FileUtils } from './fileUtils'
import { Logger } from './logger'
import { ValidationReport } from './validationReport'

describe('Logger', () => {
  let logger: Logger

  beforeEach(() => {
    // Create logger (console-only, no file output)
    logger = new Logger()
  })

  it('should be instantiable', () => {
    expect(logger).toBeDefined()
    expect(logger).toBeInstanceOf(Logger)
  })

  it('should have logging methods', () => {
    expect(typeof logger.success).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.log).toBe('function')
    expect(typeof logger.skip).toBe('function')
  })
})

describe('FileUtils', () => {
  let mockLogger: Logger
  let fileUtils: FileUtils

  beforeEach(() => {
    mockLogger = {
      success: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
    } as unknown as Logger

    fileUtils = new FileUtils(mockLogger)
  })

  it('should be instantiable', () => {
    expect(fileUtils).toBeDefined()
    expect(fileUtils).toBeInstanceOf(FileUtils)
  })

  describe('getMimeType', () => {
    it('should return correct MIME type for audio files', () => {
      expect(fileUtils.getMimeType('test.mp3')).toBe('audio/mpeg')
      expect(fileUtils.getMimeType('test.wav')).toBe('audio/wav')
      expect(fileUtils.getMimeType('test.m4a')).toBe('audio/aac')
      expect(fileUtils.getMimeType('test.ogg')).toBe('audio/ogg')
    })

    it('should return correct MIME type for image files', () => {
      expect(fileUtils.getMimeType('test.jpg')).toBe('image/jpeg')
      expect(fileUtils.getMimeType('test.jpeg')).toBe('image/jpeg')
      expect(fileUtils.getMimeType('test.png')).toBe('image/png')
      expect(fileUtils.getMimeType('test.webp')).toBe('image/webp')
    })

    it('should return correct MIME type for video files', () => {
      expect(fileUtils.getMimeType('test.mp4')).toBe('video/mp4')
      expect(fileUtils.getMimeType('test.webm')).toBe('video/webm')
    })

    it('should return correct MIME type for documents', () => {
      expect(fileUtils.getMimeType('test.pdf')).toBe('application/pdf')
    })

    it('should return octet-stream for unknown extensions', () => {
      expect(fileUtils.getMimeType('test.xyz')).toBe('application/octet-stream')
      expect(fileUtils.getMimeType('test')).toBe('application/octet-stream')
    })

    it('should handle uppercase extensions', () => {
      expect(fileUtils.getMimeType('test.MP3')).toBe('audio/mpeg')
      expect(fileUtils.getMimeType('test.JPG')).toBe('image/jpeg')
    })
  })

  describe('fileExists', () => {
    it('should return false for non-existent files', async () => {
      const exists = await fileUtils.fileExists('/non/existent/path/file.txt')
      expect(exists).toBe(false)
    })
  })
})

describe('ValidationReport', () => {
  let report: ValidationReport

  beforeEach(() => {
    report = new ValidationReport()
  })

  it('should be instantiable', () => {
    expect(report).toBeDefined()
    expect(report).toBeInstanceOf(ValidationReport)
  })

  describe('warnings', () => {
    it('should track warnings', () => {
      expect(report.getWarningCount()).toBe(0)
      report.addWarning('Test warning 1')
      report.addWarning('Test warning 2')
      expect(report.getWarningCount()).toBe(2)
    })
  })

  describe('errors', () => {
    it('should track errors', () => {
      expect(report.getErrorCount()).toBe(0)
      report.addError('Test error 1')
      expect(report.getErrorCount()).toBe(1)
    })
  })

  describe('field mappings', () => {
    it('should track field mappings', () => {
      report.addFieldMapping('old_field', 'new_field', 'Renamed')
      // Field mappings are tracked internally, verified during generate
      expect(report).toBeDefined()
    })
  })

  describe('records summary', () => {
    it('should track created records', () => {
      const initial = report.getSummary()
      expect(initial.created).toBe(0)

      report.incrementCreated()
      report.incrementCreated()
      expect(report.getSummary().created).toBe(2)
    })

    it('should track skipped records', () => {
      report.incrementSkipped()
      expect(report.getSummary().skipped).toBe(1)
    })

    it('should track error records', () => {
      report.incrementErrors()
      expect(report.getSummary().errors).toBe(1)
    })

    it('should track updated records', () => {
      report.incrementUpdated()
      report.incrementUpdated()
      expect(report.getSummary().updated).toBe(2)
    })

    it('should allow setting complete summary', () => {
      report.setRecordsSummary({ created: 10, updated: 3, skipped: 5, errors: 2 })
      const summary = report.getSummary()
      expect(summary.created).toBe(10)
      expect(summary.updated).toBe(3)
      expect(summary.skipped).toBe(5)
      expect(summary.errors).toBe(2)
    })
  })

  describe('reset', () => {
    it('should reset all tracked data', () => {
      report.addWarning('warning')
      report.addError('error')
      report.incrementCreated()

      report.reset()

      expect(report.getWarningCount()).toBe(0)
      expect(report.getErrorCount()).toBe(0)
      expect(report.getSummary().created).toBe(0)
    })
  })
})

/**
 * `verifyRun` is what a script asserts about itself when no database floor can
 * be stated. The default has to be a pass, or every existing importer would
 * start failing; an override's failure has to reach the caller, or declaring
 * the invariant buys nothing.
 */
describe('BaseImporter.verifyRun', () => {
  class Quiet extends BaseImporter<BaseImportOptions> {
    protected readonly importName = 'Quiet'
    protected readonly cacheDir = '/tmp/seed-verify-run-quiet'
    protected async import(): Promise<void> {}
  }

  class Loud extends BaseImporter<BaseImportOptions> {
    protected readonly importName = 'Loud'
    protected readonly cacheDir = '/tmp/seed-verify-run-loud'
    protected async import(): Promise<void> {}

    async verifyRun(): Promise<RunVerification> {
      return { passed: false, failures: ['3 of 4 entries accounted for'] }
    }
  }

  const options: BaseImportOptions = { dryRun: true, clearCache: false }

  it('passes by default, with nothing to report', async () => {
    await expect(new Quiet(options).verifyRun()).resolves.toEqual({
      passed: true,
      failures: [],
    })
  })

  it('carries an override failure and its reason', async () => {
    const verification = await new Loud(options).verifyRun()

    expect(verification.passed).toBe(false)
    expect(verification.failures).toEqual(['3 of 4 entries accounted for'])
  })
})
