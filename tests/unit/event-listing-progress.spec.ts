import { describe, expect, it } from 'vitest'

import type { EventQualityReport, QualityCheckResult } from '@/lib/eventQuality'
import { EVENT_QUALITY_CHECK_METADATA } from '@/lib/eventQuality'
import { listingProgressFromReport } from '@/lib/notifications'

/**
 * The reminder email's projection of a listing-quality report (#611): open
 * items, already-done items, and the counts behind the progress bar. Rendering
 * is covered by `event-verification-email.spec.ts`; the job wiring by
 * `tests/int/event-verification.int.spec.ts`.
 */

const report = (checks: QualityCheckResult[]): EventQualityReport => ({
  skipped: false,
  checks,
  openCount: checks.filter((check) => check.status === 'failed').length,
})

const meta = (key: string) => EVENT_QUALITY_CHECK_METADATA[key]

describe('listingProgressFromReport', () => {
  it('takes the registry label and description for an open item', () => {
    const progress = listingProgressFromReport(
      report([{ key: 'description.missing', status: 'failed' }]),
    )

    expect(progress?.open).toEqual([
      {
        key: 'description.missing',
        label: meta('description.missing').label,
        detail: meta('description.missing').description,
      },
    ])
  })

  it('prefers the check’s own detail over the static description', () => {
    const progress = listingProgressFromReport(
      report([
        { key: 'description.quality', status: 'failed', detail: 'The description repeats it all.' },
      ]),
    )
    expect(progress?.open[0].detail).toBe('The description repeats it all.')
  })

  it('words a passing check as a state reached, not an instruction', () => {
    // A tick beside "Take the address out" reads as an endorsement of leaving
    // it in — which is why `passedLabel` exists at all.
    const progress = listingProgressFromReport(report([{ key: 'title.quality', status: 'passed' }]))
    expect(progress?.done).toEqual([
      { key: 'title.quality', label: meta('title.quality').passedLabel },
    ])
    expect(progress?.done[0].label).not.toBe(meta('title.quality').label)
  })

  it('splits open from done and counts both', () => {
    const progress = listingProgressFromReport(
      report([
        { key: 'description.missing', status: 'passed' },
        { key: 'description.quality', status: 'passed' },
        { key: 'title.quality', status: 'failed' },
        { key: 'images.insufficient', status: 'failed' },
      ]),
    )
    expect(progress?.open.map((item) => item.key)).toEqual(['title.quality', 'images.insufficient'])
    expect(progress?.done.map((item) => item.key)).toEqual([
      'description.missing',
      'description.quality',
    ])
    expect(progress).toMatchObject({ resolved: 2, total: 4 })
  })

  it('reports a complete listing as complete, not as nothing', () => {
    // The distinction that earns the celebration: everything passed.
    const progress = listingProgressFromReport(
      report([
        { key: 'description.missing', status: 'passed' },
        { key: 'images.insufficient', status: 'passed' },
      ]),
    )
    expect(progress?.open).toEqual([])
    expect(progress).toMatchObject({ resolved: 2, total: 2 })
  })

  it('returns null for a skipped report — never checked is not a clean bill', () => {
    expect(listingProgressFromReport({ skipped: true, reason: 'unpublished' })).toBeNull()
  })

  it('drops a key the registry no longer knows, from the list and the tally', () => {
    const progress = listingProgressFromReport(
      report([
        { key: 'retired.check', status: 'failed', detail: 'gone' },
        { key: 'images.insufficient', status: 'failed' },
      ]),
    )
    expect(progress?.open.map((item) => item.key)).toEqual(['images.insufficient'])
    // The bar must never count something it won't name.
    expect(progress).toMatchObject({ resolved: 0, total: 1 })
  })

  it('leaves a pending check out of the ratio entirely', () => {
    // Something that cannot exist yet is neither an achievement nor a debt.
    const progress = listingProgressFromReport(
      report([
        { key: 'description.missing', status: 'passed' },
        { key: 'title.quality', status: 'pending' },
      ]),
    )
    expect(progress).toMatchObject({ resolved: 1, total: 1 })
    expect(progress?.open).toEqual([])
    expect(progress?.done.map((item) => item.key)).toEqual(['description.missing'])
  })

  it('keeps every open item — the registry can only ever open three at once', () => {
    // `description.quality` is skipped whenever `description.missing` fails, so
    // no listing can produce a longer list. This is why the email has no cap.
    const keys = ['description.missing', 'title.quality', 'images.insufficient'] as const
    const progress = listingProgressFromReport(
      report(keys.map((key) => ({ key, status: 'failed' as const }))),
    )
    expect(progress?.open.map((item) => item.key)).toEqual([...keys])
    expect(progress).toMatchObject({ resolved: 0, total: 3 })
  })

  it('never moves the bar backwards when a manager fixes something', () => {
    // The gamification trap: `description.quality` only starts being checked
    // once `description.missing` passes, so acting on the advice grows the
    // denominator. It grows the numerator too — (n+1)/(d+1) > n/d whenever
    // n < d — so the ratio is monotonic and effort is never punished.
    const ratio = (r: { resolved: number; total: number }) => r.resolved / r.total

    // Before: no description, so `description.quality` isn't even evaluated.
    const before = listingProgressFromReport(
      report([
        { key: 'description.missing', status: 'failed' },
        { key: 'title.quality', status: 'passed' },
        { key: 'images.insufficient', status: 'passed' },
      ]),
    )!

    // After: a description exists but repeats the address, so the newly-added
    // check fails. The worst realistic outcome of doing the right thing.
    const after = listingProgressFromReport(
      report([
        { key: 'description.missing', status: 'passed' },
        { key: 'description.quality', status: 'failed' },
        { key: 'title.quality', status: 'passed' },
        { key: 'images.insufficient', status: 'passed' },
      ]),
    )!

    expect(before).toMatchObject({ resolved: 2, total: 3 })
    expect(after).toMatchObject({ resolved: 3, total: 4 })
    expect(ratio(after)).toBeGreaterThan(ratio(before))
  })
})
