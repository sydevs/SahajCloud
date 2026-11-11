/**
 * The one capture body behind every report this service sends, plus the rule
 * that keeps it the only one.
 *
 * The per-site specs each drive one caller through its own path. This one
 * covers what no caller can show: the defaults a site leaves out, and what
 * happens when the SDK throws.
 */
import { relative } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({
  captureException: sentry.captureException,
  captureMessage: sentry.captureMessage,
}))

import { capture } from '@/plugins/sentry/capture'

import { sourceFiles, sourceOf, SRC } from '../utils/importGraph'
import { capturedFrom } from '../utils/sentryCapture'

const captured = () => capturedFrom(sentry.captureMessage)
const capturedError = () => capturedFrom(sentry.captureException)

const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('what the body sends the report through', () => {
  it('sends a message as a message, and an exception as an exception', () => {
    capture({ message: 'something to know about' })
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
    expect(sentry.captureException).not.toHaveBeenCalled()

    const thrown = new Error('per-event failure')
    capture({ error: thrown, message: 'a run kept going' })

    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
    // The message is the log mirror's, not a second Sentry event.
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
  })
})

describe('the level a site leaves out', () => {
  it('is a warning for a message, and an error for an exception', () => {
    capture({ message: 'something to know about' })
    expect(captured().level).toBe('warning')

    capture({ error: new Error('dropped'), message: 'email dropped' })
    expect(capturedError().level).toBe('error')
  })

  it('is whatever the site says instead', () => {
    capture({ message: 'something worse', level: 'error' })
    expect(captured().level).toBe('error')

    capture({ error: new Error('one of many'), message: 'per-event failure', level: 'warning' })
    expect(capturedError().level).toBe('warning')
  })
})

describe('the tags a report carries', () => {
  it('sends only what the site brought', () => {
    capture({ message: 'milestone', tags: { clientId: '7', milestone: 'first' } })
    expect(captured().tags).toEqual({ clientId: '7', milestone: 'first' })
  })

  /**
   * ⚠ The deployment is the event's own `environment` FIELD, set by
   * `Sentry.init`. A tag beside it filtered nothing the field did not.
   */
  it('adds no deployment tag of its own', () => {
    capture({ message: 'something to know about' })
    expect(captured().tags).toEqual({})
  })

  it('drops a tag Sentry has no use for, rather than sending it empty', () => {
    capture({ message: 'milestone', tags: { blank: '', kept: 'yes', missing: undefined } })
    expect(captured().tags).toEqual({ kept: 'yes' })
  })

  it('tags an exception the same way, through the same body', () => {
    capture({ error: new Error('cache write failed'), message: 'cache', tags: { issue: '390' } })
    expect(capturedError().tags).toEqual({ issue: '390' })
  })
})

describe('who the report names', () => {
  it('puts a caller’s IP where the scrubbers reach it, and nowhere else', () => {
    capture({ message: 'credential rejected', extra: { status: 403 }, ip: '203.0.113.7' })

    expect(captured().user).toEqual({ ip_address: '203.0.113.7' })
    expect(captured().extra).not.toHaveProperty('ip')
  })

  it('prefers the acting user over an IP, which cannot name one', () => {
    capture({ message: 'rejected', ip: '203.0.113.7', user: { id: '4' } })
    expect(captured().user).toEqual({ id: '4' })
  })

  it('sends no user for a site that names neither', () => {
    capture({ message: 'no region manager' })
    expect(captured().user).toBeUndefined()
  })
})

describe('what passes through untouched', () => {
  it('passes a fingerprint and extras through', () => {
    capture({
      message: 'a repeat signup replaced a confirmed registration',
      extra: { submissionId: 42 },
      fingerprint: ['mergeRepeatRegistration', '42'],
    })

    expect(captured()).toMatchObject({
      extra: { submissionId: 42 },
      fingerprint: ['mergeRepeatRegistration', '42'],
    })
  })
})

describe('the application-log mirror', () => {
  it('writes the message and its extras at the level of the report', () => {
    capture({ message: 'no region manager', extra: { eventId: 7 }, logger })
    expect(logger.warn).toHaveBeenCalledWith({ msg: 'no region manager', eventId: 7 })

    capture({ message: 'email dropped', level: 'error', logger })
    expect(logger.error).toHaveBeenCalledWith({ msg: 'email dropped' })

    capture({ message: 'no manager to notify', level: 'info', logger })
    expect(logger.info).toHaveBeenCalledWith({ msg: 'no manager to notify' })
  })

  it('carries the exception itself on `err`, so the line keeps its stack', () => {
    const thrown = new Error('per-event failure')
    capture({ error: thrown, message: 'ExpireEvents: per-event failure', level: 'warning', logger })

    expect(logger.warn).toHaveBeenCalledWith({
      msg: 'ExpireEvents: per-event failure',
      err: thrown,
    })
  })

  it('is silent for a site that writes its own line', () => {
    capture({ message: 'milestone', tags: { clientId: '7' } })
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

describe('a telemetry failure', () => {
  it('does not reach the caller, which is mid-success', () => {
    sentry.captureMessage.mockImplementationOnce(() => {
      throw new Error('transport is down')
    })
    expect(() => capture({ message: 'no manager to notify' })).not.toThrow()
  })

  /**
   * ⚠ The six per-item job sites had no guard of their own before this body
   * reached them: a throwing transport aborted a run written to continue.
   */
  it('does not abort a run that was continuing past a per-item failure', () => {
    sentry.captureException.mockImplementationOnce(() => {
      throw new Error('transport is down')
    })

    expect(capture({ error: new Error('one event'), message: 'per-event failure' })).toBe(false)
  })

  it('does not cost the report when it is the log destination that fails', () => {
    const broken = {
      ...logger,
      warn: vi.fn(() => {
        throw new Error('log destination is down')
      }),
    }

    expect(() => capture({ message: 'no region manager', logger: broken })).not.toThrow()
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
  })
})

/**
 * ⚠ **The three browser sites are deliberately out.** `clientLogger`,
 * `ErrorBoundary` and `global-error` carry a console mirror and a
 * `getClient()` check this body does not have, and `clientLogger` is the
 * browser's own equivalent of it rather than one of its callers.
 */
const BROWSER_REPORTERS = [
  'app/global-error.tsx',
  'components/ErrorBoundary.tsx',
  'lib/logger/clientLogger.ts',
]

describe('nothing outside the plugin captures for itself', () => {
  it('leaves both SDK entry points to the one body', () => {
    const offenders = sourceFiles()
      .filter((file) => /Sentry\.capture(Exception|Message)\(/.test(sourceOf(file)))
      .map((file) => relative(SRC, file))
      .sort()

    expect(offenders).toEqual([...BROWSER_REPORTERS, 'plugins/sentry/capture.ts'].sort())
  })
})
