import { describe, expect, it, vi } from 'vitest'

import {
  classifyStatuses,
  discoverPreview,
  StatusFetchError,
  type CommitStatus,
  type PreviewStatus,
} from '../../scripts/railway-preview-status'

/**
 * Guards the fail-closed rule from #661: a Railway deploy that reports
 * `success` while publishing no host is a terminal misconfiguration, not
 * a preview that has yet to appear. Discovery used to re-poll it for the
 * full 12-minute budget and then skip the smoke lane with exit 0, so CI
 * read green while the Tier-3 lane had not run on any PR for weeks.
 *
 * Fixture assumption: Railway posts context `"sahajcloud - SahajCloud"`
 * — `<project> - <service>` — with either
 * `"Success - <host>.up.railway.app"` or a bare `"Success"`. Verified
 * against the live commit statuses on PR #700 (host present) and PR #699
 * (bare `Success`), via the GitHub statuses API.
 */

const READY: CommitStatus = {
  context: 'sahajcloud - SahajCloud',
  state: 'success',
  description: 'Success - sahajcloud-sahajcloud-pr-700.up.railway.app',
}
const UNPUBLISHED: CommitStatus = {
  context: 'sahajcloud - SahajCloud',
  state: 'success',
  description: 'Success',
}
const PENDING: CommitStatus = {
  context: 'sahajcloud - SahajCloud',
  state: 'pending',
  description: 'Railway is deploying the service',
}
const FAILED: CommitStatus = {
  context: 'sahajcloud - SahajCloud',
  state: 'error',
  description: 'Deployment cancelled',
}
// Railway's context is `<project> - <service>`, so a sibling service on the
// same project shares the project half. `mailpit - Mailpit` was never a
// shape Railway posts, so the old fixture asserted against a string that
// could not occur. With the real shape, the discrimination rests on
// `includes` being case-sensitive: the project slug is `sahajcloud`, the
// service is `SahajCloud`. That is load-bearing — a case-insensitive match
// here would claim a sibling service's host as the preview.
const OTHER: CommitStatus = {
  context: 'sahajcloud - Mailpit',
  state: 'success',
  description: 'Success - mailpit-production-db88.up.railway.app',
}

describe('classifyStatuses', () => {
  it('reads a published host as ready', () => {
    expect(classifyStatuses([READY], 'SahajCloud')).toEqual({
      kind: 'ready',
      url: 'https://sahajcloud-sahajcloud-pr-700.up.railway.app',
      description: READY.description,
    })
  })

  it('reads success with no host as unpublished, not as pending', () => {
    expect(classifyStatuses([UNPUBLISHED], 'SahajCloud')).toEqual({
      kind: 'unpublished',
      description: 'Success',
    })
  })

  it('reads a deploy still running as pending', () => {
    expect(classifyStatuses([PENDING], 'SahajCloud').kind).toBe('pending')
  })

  it('reads failure and error as failed', () => {
    expect(classifyStatuses([FAILED], 'SahajCloud').kind).toBe('failed')
    expect(classifyStatuses([{ ...FAILED, state: 'failure' }], 'SahajCloud').kind).toBe('failed')
  })

  it('reads no matching context as absent, ignoring another service', () => {
    expect(classifyStatuses([OTHER], 'SahajCloud')).toEqual({ kind: 'absent' })
    expect(classifyStatuses([], 'SahajCloud')).toEqual({ kind: 'absent' })
  })

  it('takes the newest status per context, not the first success', () => {
    // GitHub returns statuses most-recent first, so a stale success behind
    // a newer pending must not be mistaken for the current state.
    expect(classifyStatuses([PENDING, READY], 'SahajCloud').kind).toBe('pending')
    expect(classifyStatuses([OTHER, UNPUBLISHED, READY], 'SahajCloud').kind).toBe('unpublished')
  })
})

/** Drive `discoverPreview` over a scripted sequence of poll results. */
function harness(pages: (CommitStatus[] | Error)[], timeoutMs = 12 * 60_000) {
  let clock = 0
  const sleep = vi.fn(async (ms: number) => {
    clock += ms
  })
  let call = 0
  const fetchStatuses = vi.fn(async () => {
    const page = pages[Math.min(call++, pages.length - 1)]
    if (page instanceof Error) throw page
    return page
  })
  return {
    sleep,
    fetchStatuses,
    run: () =>
      discoverPreview({
        fetchStatuses,
        contextMatch: 'SahajCloud',
        timeoutMs,
        pollIntervalMs: 15_000,
        sleep,
        now: () => clock,
        log: () => {},
      }),
  }
}

describe('discoverPreview', () => {
  it('returns unpublished on the first poll, without sleeping', async () => {
    // The #661 regression: 48 identical polls across 12m15s before a
    // silent skip. One poll, no sleep, and a terminal answer.
    const h = harness([[UNPUBLISHED]])
    await expect(h.run()).resolves.toEqual({ kind: 'unpublished', description: 'Success' })
    expect(h.fetchStatuses).toHaveBeenCalledTimes(1)
    expect(h.sleep).not.toHaveBeenCalled()
  })

  it('polls through pending and returns ready, sleeping only between polls', async () => {
    const h = harness([[PENDING], [READY]])
    const outcome = await h.run()
    expect(outcome).toMatchObject({
      kind: 'ready',
      url: 'https://sahajcloud-sahajcloud-pr-700.up.railway.app',
    })
    expect(h.sleep).toHaveBeenCalledTimes(1)
  })

  it('returns failed without sleeping', async () => {
    const h = harness([[FAILED]])
    expect((await h.run()).kind).toBe('failed')
    expect(h.sleep).not.toHaveBeenCalled()
  })

  it('retries a throwing fetch rather than giving up', async () => {
    const h = harness([new Error('GitHub statuses API: HTTP 502'), [READY]])
    expect((await h.run()).kind).toBe('ready')
    expect(h.fetchStatuses).toHaveBeenCalledTimes(2)
  })

  it('times out when no status ever appears, reporting what it last saw', async () => {
    const h = harness([[]], 45_000)
    const outcome = await h.run()
    expect(outcome).toEqual({
      kind: 'timeout',
      last: { kind: 'absent' } satisfies PreviewStatus,
      elapsedMs: 45_000,
      reads: 3,
      errors: 0,
    })
    expect(h.fetchStatuses).toHaveBeenCalledTimes(3)
  })

  it('separates "every read failed" from "no status appeared"', () => {
    // Polls that all fail are not evidence that no preview exists.
    // `reads: 0` is what lets the caller tell the two apart, so it can say
    // "unknown" rather than "absent". A statusless error stays retryable.
    const h = harness([new Error('GitHub statuses API: HTTP 502')], 45_000)
    return expect(h.run()).resolves.toMatchObject({
      kind: 'timeout',
      reads: 0,
      errors: 3,
      last: { kind: 'absent' },
    })
  })

  it.each([401, 403])('returns forbidden on HTTP %i, without sleeping', async (status) => {
    // A revoked `statuses: read` scope must not read as an absent preview —
    // that is #661's silent green through another door. GitHub will not
    // relent inside one run, so spending the full budget first buys
    // nothing and delays a red run by 12 minutes.
    const h = harness([new StatusFetchError(`GitHub statuses API: HTTP ${status}`, status)])
    await expect(h.run()).resolves.toEqual({
      kind: 'forbidden',
      status,
      message: `GitHub statuses API: HTTP ${status}`,
    })
    expect(h.fetchStatuses).toHaveBeenCalledTimes(1)
    expect(h.sleep).not.toHaveBeenCalled()
  })

  it('keeps retrying a transient status, so an incident does not fail the run', async () => {
    // The set is deliberately narrow: only what GitHub will still refuse on
    // the next poll is terminal. A 502 or a rate-limit spell must not turn
    // every open PR red.
    const h = harness([new StatusFetchError('GitHub statuses API: HTTP 502', 502), [READY]])
    expect((await h.run()).kind).toBe('ready')
    expect(h.fetchStatuses).toHaveBeenCalledTimes(2)
  })

  it('never sleeps past the deadline, so the budget is not overrun', async () => {
    // The last sleep gates no further poll. Unclamped it overran the
    // advertised budget by up to a full interval — 15s of dead CI clock.
    const h = harness([[]], 40_000)
    expect(await h.run()).toMatchObject({ kind: 'timeout', elapsedMs: 40_000 })
    expect(h.sleep.mock.calls.map(([ms]) => ms)).toEqual([15_000, 15_000, 10_000])
  })

  it('times out on a deploy that never leaves pending', async () => {
    const h = harness([[PENDING]], 30_000)
    const outcome = await h.run()
    expect(outcome).toMatchObject({ kind: 'timeout', last: { kind: 'pending' } })
  })
})
