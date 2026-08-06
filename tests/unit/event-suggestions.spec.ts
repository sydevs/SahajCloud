import { describe, expect, it } from 'vitest'

import type { EventQualityReport, QualityCheckResult } from '@/lib/eventQuality'
import { EVENT_QUALITY_CHECK_METADATA } from '@/lib/eventQuality'
import { suggestionsFromReport } from '@/lib/notifications'

/**
 * The reminder email's projection of a listing-quality report (#611): open
 * items only, worded by the check registry. Rendering is covered by
 * `event-verification-email.spec.ts`; the job wiring by
 * `tests/int/event-verification.int.spec.ts`.
 */

const report = (checks: QualityCheckResult[]): EventQualityReport => ({
  skipped: false,
  checks,
  openCount: checks.filter((check) => check.status === 'failed').length,
})

describe('suggestionsFromReport', () => {
  it('takes the registry label and description for an open item', () => {
    const suggestions = suggestionsFromReport(
      report([{ key: 'description.missing', status: 'failed' }]),
    )

    const meta = EVENT_QUALITY_CHECK_METADATA['description.missing']
    expect(suggestions).toEqual([
      { key: 'description.missing', label: meta.label, detail: meta.description },
    ])
  })

  it('prefers the check’s own detail over the static description', () => {
    const suggestions = suggestionsFromReport(
      report([
        { key: 'description.quality', status: 'failed', detail: 'The description repeats it all.' },
      ]),
    )
    expect(suggestions?.[0].detail).toBe('The description repeats it all.')
  })

  it('drops passing checks — an email is a nudge, not a scorecard', () => {
    const suggestions = suggestionsFromReport(
      report([
        { key: 'description.missing', status: 'passed' },
        { key: 'images.insufficient', status: 'failed' },
      ]),
    )
    expect(suggestions?.map((item) => item.key)).toEqual(['images.insufficient'])
  })

  it('returns undefined for a listing with nothing open', () => {
    expect(
      suggestionsFromReport(report([{ key: 'description.missing', status: 'passed' }])),
    ).toBeUndefined()
  })

  it('returns undefined for a skipped report', () => {
    // Not "no problems found" — the listing was never checked.
    expect(suggestionsFromReport({ skipped: true, reason: 'unpublished' })).toBeUndefined()
  })

  it('drops a key the registry no longer knows, rather than printing a slug', () => {
    const suggestions = suggestionsFromReport(
      report([
        { key: 'retired.check', status: 'failed', detail: 'gone' },
        { key: 'images.insufficient', status: 'failed' },
      ]),
    )
    expect(suggestions?.map((item) => item.key)).toEqual(['images.insufficient'])
  })

  it('keeps every open item — the registry can only ever open three at once', () => {
    // `description.quality` is skipped whenever `description.missing` fails, so
    // no listing can produce a longer list. This is why the email has no cap.
    const keys = ['description.missing', 'title.quality', 'images.insufficient'] as const
    const suggestions = suggestionsFromReport(
      report(keys.map((key) => ({ key, status: 'failed' as const }))),
    )
    expect(suggestions?.map((item) => item.key)).toEqual([...keys])
  })
})
