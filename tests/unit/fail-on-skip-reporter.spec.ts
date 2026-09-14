import type { FullResult, TestCase, TestResult } from '@playwright/test/reporter'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import playwrightConfig from '../../playwright.config'
import FailOnSkipReporter from '../e2e/_helpers/failOnSkipReporter'

/**
 * The reporter's failure mode is silence, so it needs a lane that is not the
 * lane it guards. #704: three smoke specs skipped themselves on every PR and
 * the job stayed green — a guard against that must not itself be removable
 * without something going red.
 */

const testCase = (title: string) => ({ titlePath: () => ['', 'spec.ts', title] }) as TestCase

const ended = (status: TestResult['status']) => ({ status }) as TestResult

const finished = (status: FullResult['status']) => ({ status }) as FullResult

describe('FailOnSkipReporter', () => {
  const originalPreviewUrl = process.env.PREVIEW_URL

  beforeEach(() => {
    delete process.env.PREVIEW_URL
  })

  afterEach(() => {
    if (originalPreviewUrl === undefined) delete process.env.PREVIEW_URL
    else process.env.PREVIEW_URL = originalPreviewUrl
  })

  it('fails a passing run that skipped a spec against a preview', async () => {
    process.env.PREVIEW_URL = 'https://preview.example.invalid'
    const reporter = new FailOnSkipReporter()
    reporter.onTestEnd(testCase('skips itself'), ended('skipped'))

    expect(await reporter.onEnd(finished('passed'))).toEqual({ status: 'failed' })
  })

  it('leaves a run alone when no preview answered', async () => {
    const reporter = new FailOnSkipReporter()
    reporter.onTestEnd(testCase('skips itself'), ended('skipped'))

    expect(await reporter.onEnd(finished('passed'))).toBeUndefined()
  })

  it('leaves a run with no skips alone', async () => {
    process.env.PREVIEW_URL = 'https://preview.example.invalid'
    const reporter = new FailOnSkipReporter()
    reporter.onTestEnd(testCase('asserts something'), ended('passed'))

    expect(await reporter.onEnd(finished('passed'))).toBeUndefined()
  })

  it('clears a skipped attempt that a retry then ran', async () => {
    process.env.PREVIEW_URL = 'https://preview.example.invalid'
    const reporter = new FailOnSkipReporter()
    const flaky = testCase('skipped once, then ran')
    reporter.onTestEnd(flaky, ended('skipped'))
    reporter.onTestEnd(flaky, ended('passed'))

    expect(await reporter.onEnd(finished('passed'))).toBeUndefined()
  })

  it('keeps the status of a run that already failed', async () => {
    process.env.PREVIEW_URL = 'https://preview.example.invalid'
    const reporter = new FailOnSkipReporter()
    reporter.onTestEnd(testCase('skips itself'), ended('skipped'))

    // 'timedout' says more than 'failed' does; promoting is only for a pass.
    expect(await reporter.onEnd(finished('timedout'))).toBeUndefined()
  })

  it('is wired into the Playwright config', () => {
    const reporters = playwrightConfig.reporter as ReadonlyArray<readonly [string, unknown?]>
    expect(reporters.some(([name]) => name.includes('failOnSkipReporter'))).toBe(true)
  })
})
