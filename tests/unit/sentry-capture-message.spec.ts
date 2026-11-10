/**
 * The capture body behind every message this service reports, plus the rule
 * that keeps it the only one.
 *
 * The per-site specs (`endpoint-guard-credential-rejected.spec.ts`,
 * `user-submissions-repeat-registration.int.spec.ts`,
 * `expire-events.int.spec.ts`) each drive one caller through its own path. This
 * one covers what no caller can show: the defaults a site leaves out, and what
 * happens when the SDK throws.
 */
import { relative } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({ captureMessage: sentry.captureMessage }))

vi.mock('@/lib/env/deploymentEnvironment', () => ({
  deploymentEnvironment: () => 'pr-1100',
}))

import { captureMessage } from '@/plugins/sentry/captureMessage'

import { sourceFiles, sourceOf, SRC } from '../utils/importGraph'

/** The capture context the body handed the SDK on its latest call. */
const captured = () =>
  (sentry.captureMessage.mock.calls.at(-1)?.[1] ?? {}) as {
    contexts?: Record<string, unknown>
    extra?: Record<string, unknown>
    fingerprint?: string[]
    level?: string
    tags?: Record<string, string>
    user?: Record<string, string>
  }

/**
 * Fixture pre-mortem — what the two stubs above and below assume:
 *
 * - `deploymentEnvironment()` is the one thing `captureTags` reads, and
 *   `pr-<number>` is a real answer from it. Checked against
 *   `src/lib/env/deploymentEnvironment.ts`.
 * - A logger exposes `warn`, `error` and `info`. Checked against the
 *   `Pick<Payload['logger'], …>` the body takes, so `tsc` holds it.
 */
const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a reported message', () => {
  it('is a warning unless the site says otherwise', () => {
    captureMessage({ message: 'something to know about' })
    expect(captured().level).toBe('warning')

    captureMessage({ message: 'something worse', level: 'error' })
    expect(captured().level).toBe('error')
  })

  it('carries the deployment, so it filters beside the exceptions next to it', () => {
    captureMessage({ message: 'something to know about' })
    expect(captured().tags).toEqual({ environment: 'pr-1100' })
  })

  it('keeps the deployment when a site brings tags of its own', () => {
    captureMessage({ message: 'milestone', tags: { clientId: '7', milestone: 'first' } })
    expect(captured().tags).toEqual({ clientId: '7', environment: 'pr-1100', milestone: 'first' })
  })

  it('drops a tag Sentry has no use for, rather than sending it empty', () => {
    captureMessage({ message: 'milestone', tags: { blank: '', missing: null, zero: 0 } })
    expect(captured().tags).toEqual({ environment: 'pr-1100' })
  })

  it('passes a fingerprint, named contexts and a user through untouched', () => {
    captureMessage({
      message: 'a repeat signup replaced a confirmed registration',
      contexts: { abuse_details: { threshold: 1000 } },
      extra: { submissionId: 42 },
      fingerprint: ['mergeRepeatRegistration', '42'],
      user: { ip_address: '203.0.113.7' },
    })

    expect(captured()).toMatchObject({
      contexts: { abuse_details: { threshold: 1000 } },
      extra: { submissionId: 42 },
      fingerprint: ['mergeRepeatRegistration', '42'],
      user: { ip_address: '203.0.113.7' },
    })
  })
})

describe('the application-log mirror', () => {
  it('writes the message and its extras at the level of the report', () => {
    captureMessage({ message: 'no region manager', extra: { eventId: 7 }, logger })
    expect(logger.warn).toHaveBeenCalledWith({ msg: 'no region manager', eventId: 7 })

    captureMessage({ message: 'email dropped', level: 'error', logger })
    expect(logger.error).toHaveBeenCalledWith({ msg: 'email dropped' })

    captureMessage({ message: 'no manager to notify', level: 'info', logger })
    expect(logger.info).toHaveBeenCalledWith({ msg: 'no manager to notify' })
  })
})

describe('a telemetry failure', () => {
  it('does not reach the caller, which is mid-success', () => {
    sentry.captureMessage.mockImplementationOnce(() => {
      throw new Error('transport is down')
    })
    expect(() => captureMessage({ message: 'no manager to notify' })).not.toThrow()
  })
})

/**
 * A second spelling is what this refactor removed, and nothing else would stop
 * the sixth one arriving: the defaults and the mirror above are invisible to a
 * site that calls the SDK directly.
 *
 * ⚠ **`Sentry.captureException` is deliberately not covered.** `captureFailure`
 * reports a routed failure and cannot express a per-item failure inside a job
 * run that continues, so five sites still capture an exception themselves.
 */
describe('nothing outside the plugin captures a message itself', () => {
  it('leaves `Sentry.captureMessage` to the one body', () => {
    const offenders = sourceFiles()
      .filter((file) => sourceOf(file).includes('Sentry.captureMessage('))
      .map((file) => relative(SRC, file))

    expect(offenders).toEqual(['plugins/sentry/captureMessage.ts'])
  })
})
