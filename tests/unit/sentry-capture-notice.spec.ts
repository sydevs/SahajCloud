/**
 * The capture body behind every message this service reports, plus the rule
 * that keeps it the only one.
 *
 * The per-site specs each drive one caller through its own path. This one
 * covers what no caller can show: the defaults a site leaves out, and what
 * happens when the SDK throws.
 */
import { relative } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({ captureMessage: sentry.captureMessage }))

vi.mock('@/lib/env/deploymentEnvironment', () => ({
  deploymentEnvironment: () => 'pr-1100',
}))

import { captureNotice } from '@/plugins/sentry/captureNotice'
import { captureTags } from '@/plugins/sentry/tags'

import { sourceFiles, sourceOf, SRC } from '../utils/importGraph'
import { capturedFrom } from '../utils/sentryCapture'

const captured = () => capturedFrom(sentry.captureMessage)

/** Fixture pre-mortem: `pr-1100` is a real `deploymentEnvironment()` answer — checked against `src/lib/env/deploymentEnvironment.ts`. */
const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a reported message', () => {
  it('is a warning unless the site says otherwise', () => {
    captureNotice({ message: 'something to know about' })
    expect(captured().level).toBe('warning')

    captureNotice({ message: 'something worse', level: 'error' })
    expect(captured().level).toBe('error')
  })

  it('carries the deployment, so it filters beside the exceptions next to it', () => {
    captureNotice({ message: 'something to know about' })
    expect(captured().tags).toEqual({ environment: 'pr-1100' })
  })

  it('keeps the deployment when a site brings tags of its own', () => {
    captureNotice({ message: 'milestone', tags: { clientId: '7', milestone: 'first' } })
    expect(captured().tags).toEqual({ clientId: '7', environment: 'pr-1100', milestone: 'first' })
  })

  it('drops a tag Sentry has no use for, rather than sending it empty', () => {
    captureNotice({ message: 'milestone', tags: { blank: '', missing: undefined } })
    expect(captured().tags).toEqual({ environment: 'pr-1100' })
  })

  it('puts a caller’s IP where the scrubbers reach it, and nowhere else', () => {
    captureNotice({ message: 'credential rejected', extra: { status: 403 }, ip: '203.0.113.7' })

    expect(captured().user).toEqual({ ip_address: '203.0.113.7' })
    expect(captured().extra).not.toHaveProperty('ip')
  })

  it('sends no user for a site that names no IP', () => {
    captureNotice({ message: 'no region manager' })
    expect(captured().user).toBeUndefined()
  })

  it('passes a fingerprint and extras through untouched', () => {
    captureNotice({
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

describe('the tags both bodies send', () => {
  it('drops a value Sentry cannot tag with, which only the exception body can pass', () => {
    expect(captureTags({ job_id: 7, aborted: null, kept: 'yes' })).toEqual({
      environment: 'pr-1100',
      kept: 'yes',
    })
  })

  it('tags the deployment for a body that brings nothing', () => {
    expect(captureTags()).toEqual({ environment: 'pr-1100' })
  })
})

describe('the application-log mirror', () => {
  it('writes the message and its extras at the level of the report', () => {
    captureNotice({ message: 'no region manager', extra: { eventId: 7 }, logger })
    expect(logger.warn).toHaveBeenCalledWith({ msg: 'no region manager', eventId: 7 })

    captureNotice({ message: 'email dropped', level: 'error', logger })
    expect(logger.error).toHaveBeenCalledWith({ msg: 'email dropped' })

    captureNotice({ message: 'no manager to notify', level: 'info', logger })
    expect(logger.info).toHaveBeenCalledWith({ msg: 'no manager to notify' })
  })
})

describe('a telemetry failure', () => {
  it('does not reach the caller, which is mid-success', () => {
    sentry.captureMessage.mockImplementationOnce(() => {
      throw new Error('transport is down')
    })
    expect(() => captureNotice({ message: 'no manager to notify' })).not.toThrow()
  })

  it('does not cost the report when it is the log destination that fails', () => {
    const broken = {
      ...logger,
      warn: vi.fn(() => {
        throw new Error('log destination is down')
      }),
    }

    expect(() => captureNotice({ message: 'no region manager', logger: broken })).not.toThrow()
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
  })
})

/**
 * ⚠ **`Sentry.captureException` is deliberately not covered.** Nine sites still
 * capture an exception themselves. Three run in the browser, where `captureTags`
 * cannot read the deployment at all. The other six want free-form tags, a named
 * context, or a `CaptureSource` for a per-item failure inside a run that
 * continues — none of which `captureFailure` can express, and its
 * `mapPostgresCastError` exclusion is tuned for a routed request rather than a
 * job. Reaching them is one change to that body, not this one.
 */
describe('nothing outside the plugin captures a message itself', () => {
  it('leaves `Sentry.captureMessage` to the one body', () => {
    const offenders = sourceFiles()
      .filter((file) => sourceOf(file).includes('Sentry.captureMessage('))
      .map((file) => relative(SRC, file))

    expect(offenders).toEqual(['plugins/sentry/captureNotice.ts'])
  })
})
