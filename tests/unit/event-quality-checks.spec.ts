import { describe, expect, it } from 'vitest'

import type { EventQualityInput } from '@/lib/eventQuality'
import {
  buildEventQualityReport,
  countOpenDocumentIssues,
  DESCRIPTION_MIN_LENGTH,
  EVENT_QUALITY_CHECKS,
  isAutoFilledTitle,
  MINIMUM_IMAGES,
  shouldSkipQualityChecks,
} from '@/lib/eventQuality'
import { EVENT_TITLE_DEFAULTS } from '@/lib/eventTitle/compose'

/** Fixed clock so the stale-date check can't drift with the calendar. */
const NOW = new Date('2026-06-15T00:00:00.000Z')

/** Lexical value for plain paragraphs, as the Atlas importer writes them. */
const richText = (...paragraphs: string[]) => ({
  root: {
    type: 'root',
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      children: [{ type: 'text', text, version: 1 }],
      version: 1,
    })),
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
})

/**
 * A listing that passes every check, so each case can fail exactly one thing.
 * Published + verified, or the whole report short-circuits to `skipped`.
 */
const goodEvent = (overrides: Partial<EventQualityInput> = {}): EventQualityInput => ({
  _status: 'published',
  verificationStage: 'verified',
  title: 'Meditation for Night-Shift Nurses',
  languages: ['en'],
  description: richText(
    'A quiet hour of guided meditation for anyone who works nights. No experience needed, and there is nothing to bring.',
  ),
  images: [1, 2, 3],
  address: {
    venueName: 'Friends Meeting House',
    street: '9 St Peter Park Rd',
    city: 'Broadstairs',
  },
  ...overrides,
})

const resultFor = (event: EventQualityInput, key: string) => {
  const report = buildEventQualityReport(event, { now: NOW })
  if (report.skipped) throw new Error(`expected a report, got ${report.reason}`)
  return report.checks.find((r) => r.key === key)
}

const failedKeys = (event: EventQualityInput) => {
  const report = buildEventQualityReport(event, { now: NOW })
  if (report.skipped) throw new Error(`expected a report, got ${report.reason}`)
  return report.checks.filter((r) => r.status === 'failed').map((r) => r.key)
}

describe('registry integrity', () => {
  it('implements exactly the agreed check set', () => {
    expect(EVENT_QUALITY_CHECKS.map((c) => c.key)).toEqual([
      'description.missing',
      'description.quality',
      'title.quality',
      'images.insufficient',
    ])
  })

  it('gives every check a label, a passing label and a description', () => {
    // Without this, a check added later renders in the panel as a bare key —
    // and a missing passedLabel would put a tick beside an instruction.
    const unlabelled = EVENT_QUALITY_CHECKS.filter(
      (check) => !check.label?.trim() || !check.passedLabel?.trim() || !check.description?.trim(),
    )
    expect(unlabelled.map((c) => c.key)).toEqual([])
  })

  it('words the passing label as a state, not as an instruction', () => {
    const sameBothWays = EVENT_QUALITY_CHECKS.filter((c) => c.passedLabel === c.label)
    expect(sameBothWays.map((c) => c.key)).toEqual([])
  })

  it('passes a complete listing on every check', () => {
    expect(failedKeys(goodEvent())).toEqual([])
  })
})

describe('description', () => {
  it('asks for one when absent, and when barely there', () => {
    expect(resultFor(goodEvent({ description: null }), 'description.missing')?.status).toBe(
      'failed',
    )
    expect(
      resultFor(goodEvent({ description: richText('Meditation.') }), 'description.missing')?.status,
    ).toBe('failed')
    // A real description satisfies it. Not observable as a `passed` result:
    // `description.quality` then passes too and supersedes it — so what's
    // asserted is that it stopped being a finding, and that its dependent ran.
    expect(failedKeys(goodEvent())).not.toContain('description.missing')
    expect(resultFor(goodEvent(), 'description.quality')?.status).toBe('passed')
  })

  it('says nothing about quality while the description is missing', () => {
    // Two rows about the same empty field is one too many — the quality check
    // is skipped outright, not reported as passing.
    const report = buildEventQualityReport(goodEvent({ description: null }), { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    expect(report.checks.map((r) => r.key)).not.toContain('description.quality')
  })

  it('judges quality again once there is something to judge', () => {
    expect(resultFor(goodEvent(), 'description.quality')?.status).toBe('passed')
  })

  describe('a dependent supersedes the prerequisite it passed', () => {
    // The other half of `dependsOn`: while the prerequisite fails, the
    // dependent is skipped; once the dependent passes, the prerequisite has
    // nothing left to add. "Has a description" beside "Has a good quality
    // description" is one row of noise wherever the report is rendered.
    const keys = (event: EventQualityInput) => {
      const report = buildEventQualityReport(event, { now: NOW })
      if (report.skipped) throw new Error('expected a report')
      return report.checks.map((r) => r.key)
    }

    it('drops the prerequisite once its dependent also passes', () => {
      expect(keys(goodEvent())).toContain('description.quality')
      expect(keys(goodEvent())).not.toContain('description.missing')
    })

    it('keeps the prerequisite while its dependent is still open', () => {
      // The manager earned that tick and should see it while they fix the rest.
      const repeats = goodEvent({
        description: richText(
          'Meditation every Saturday at 9:00 AM at 9 St Peter Park Rd. Call us on +44 7700 900123 to check before coming.',
        ),
      })
      expect(resultFor(repeats, 'description.quality')?.status).toBe('failed')
      expect(resultFor(repeats, 'description.missing')?.status).toBe('passed')
    })

    it('never lowers the completion ratio when a listing improves', () => {
      // Superseding shrinks the denominator (4 checks collapse to 3), so the
      // reminder email's "N of M" has to be re-proved monotonic against real
      // reports, not just the projection's arithmetic. A bar that slides
      // backwards after a manager acts is worse than no bar.
      const ratio = (event: EventQualityInput) => {
        const report = buildEventQualityReport(event, { now: NOW })
        if (report.skipped) throw new Error('expected a report')
        return report.checks.filter((r) => r.status === 'passed').length / report.checks.length
      }
      const none = goodEvent({ description: null })
      const repeats = goodEvent({
        description: richText(
          'Meditation every Saturday at 9:00 AM at 9 St Peter Park Rd. Call us on +44 7700 900123 to check before coming.',
        ),
      })

      expect(ratio(repeats)).toBeGreaterThan(ratio(none))
      expect(ratio(goodEvent())).toBeGreaterThan(ratio(repeats))
    })

    it('cannot change openCount, so a stored qualityOpenCount stays comparable', () => {
      // Only ever drops checks that passed — which is what lets this ship
      // without a QUALITY_CHECK_VERSION bump.
      for (const event of [
        goodEvent(),
        goodEvent({ images: [] }),
        goodEvent({ description: null }),
      ]) {
        const report = buildEventQualityReport(event, { now: NOW })
        if (report.skipped) throw new Error('expected a report')
        expect(report.openCount).toBe(countOpenDocumentIssues(event, NOW))
        expect(report.checks.filter((r) => r.status === 'failed')).toHaveLength(report.openCount)
      }
    })
  })

  it('names exactly what the description repeats', () => {
    const cases: [string, string][] = [
      ['We meet at Friends Meeting House every week, and everyone is welcome here.', 'the address'],
      [
        'Our sessions run on Thursday, and beginners are welcome at any point too.',
        'the day or time',
      ],
      [
        'Ring us on +44 20 7946 0000 to ask about the class before you come along.',
        'contact details',
      ],
      ['Everything else is on https://example.org/classes for you to read before.', 'a web link'],
      [
        'We have been running these sessions here every week since 2019 or so now.',
        'a date that has passed',
      ],
    ]
    for (const [text, expected] of cases) {
      const result = resultFor(goodEvent({ description: richText(text) }), 'description.quality')
      expect(result?.status).toBe('failed')
      expect(result?.detail).toContain(expected)
    }
  })

  it('lists several repeats in one sentence', () => {
    const result = resultFor(
      goodEvent({
        description: richText(
          'Meet at Friends Meeting House on Thursday, or ring +44 20 7946 0000 to ask first.',
        ),
      }),
      'description.quality',
    )
    expect(result?.detail).toContain('the address')
    expect(result?.detail).toContain('the day or time')
    expect(result?.detail).toContain(' and ')
  })

  it('allows 1970 — the founding year, not a schedule', () => {
    expect(
      resultFor(
        goodEvent({
          description: richText(
            'Sahaja Yoga was founded in 1970 and has been taught freely ever since here.',
          ),
        }),
        'description.quality',
      )?.status,
    ).toBe('passed')
  })

  it('measures against the stated minimum', () => {
    const justUnder = 'x'.repeat(DESCRIPTION_MIN_LENGTH - 1)
    const justOver = 'x'.repeat(DESCRIPTION_MIN_LENGTH)
    expect(
      resultFor(goodEvent({ description: richText(justUnder) }), 'description.missing')?.status,
    ).toBe('failed')
    // Superseded once it passes, so absence from the findings is the assertion.
    expect(failedKeys(goodEvent({ description: richText(justOver) }))).not.toContain(
      'description.missing',
    )
  })
})

describe('photos', () => {
  it.each([
    [0, 'failed'],
    [MINIMUM_IMAGES - 1, 'failed'],
    [MINIMUM_IMAGES, 'passed'],
    [MINIMUM_IMAGES + 2, 'passed'],
  ])('with %i photos the check is %s', (count, status) => {
    const images = Array.from({ length: count as number }, (_, i) => i + 1)
    expect(resultFor(goodEvent({ images }), 'images.insufficient')?.status).toBe(status)
  })
})

describe('title quality', () => {
  const address = { venueName: 'Sunrise Hall', street: 'Hauptstr 1', city: 'Bremen' }

  it('is skipped entirely for a blank (hence auto-filled) title', () => {
    // The manager left the title blank, so eventTitleBeforeChange stored the
    // composed auto-title — there is no wording of theirs to judge. This is the
    // assertion that proves #605's decision didn't regress.
    const autoFilled = goodEvent({ title: 'Meditation at Sunrise Hall', address })
    expect(resultFor(autoFilled, 'title.quality')).toBeUndefined()
  })

  it('recognises every slot, not just the one the schedule implies', () => {
    for (const template of Object.values(EVENT_TITLE_DEFAULTS)) {
      const title = template.replace('%{place}', 'Friends Meeting House')
      expect(isAutoFilledTitle(title, goodEvent())).toBe(true)
    }
  })

  it('treats hand-written prose as hand-written', () => {
    expect(isAutoFilledTitle('Meditation for Night-Shift Nurses', goodEvent())).toBe(false)
  })

  describe('an online event, auto-titled from its region', () => {
    // No address to recompose from, and this module only ever sees the region's
    // id — so detection falls back to the template's shape.
    const online = goodEvent({ address: undefined })

    it('is recognised, so the check is skipped rather than crediting the manager', () => {
      expect(isAutoFilledTitle('Evening Meditation at Toronto', online)).toBe(true)
      expect(
        resultFor(
          goodEvent({ address: undefined, title: 'Morning Meditation at Rome' }),
          'title.quality',
        ),
      ).toBeUndefined()
    })

    it('does not swallow a title that says something of its own', () => {
      expect(isAutoFilledTitle('Meditation for Night-Shift Nurses', online)).toBe(false)
      expect(
        resultFor(goodEvent({ address: undefined, title: 'Meditation' }), 'title.quality')?.status,
      ).toBe('failed')
    })

    it('leaves an event that has a venue on the exact comparison', () => {
      // The shape fallback is for the address-less case only: with a venue on
      // the listing, prose in the auto-fill's shape is still prose.
      expect(isAutoFilledTitle('Evening Meditation at the pub down the road', goodEvent())).toBe(
        false,
      )
    })
  })

  it('flags a generic hand-typed title and points at the blank field', () => {
    const result = resultFor(goodEvent({ title: 'Meditation', address }), 'title.quality')
    expect(result?.status).toBe('failed')
    expect(result?.detail).toContain('Leave it blank')
  })

  it('names exactly what the title repeats', () => {
    const cases: [string, string][] = [
      ['Friends Meeting House', 'the address'],
      ['Meditation every Tuesday', 'the day or time'],
      ['Meditation — call +44 20 7946 0000', 'contact details'],
      ['Meditation https://example.org/classes', 'a web link'],
      ['Meditation since 2019', 'a date that has passed'],
    ]
    for (const [title, expected] of cases) {
      const result = resultFor(goodEvent({ title }), 'title.quality')
      expect(result?.status).toBe('failed')
      expect(result?.detail).toContain(expected)
    }
  })

  it('leaves a title that says something of its own alone', () => {
    expect(
      resultFor(goodEvent({ title: 'Beginners evening at Sunrise Hall' }), 'title.quality')?.status,
    ).toBe('passed')
    expect(
      resultFor(goodEvent({ title: 'Free Meditation Classes for Students' }), 'title.quality')
        ?.status,
    ).toBe('passed')
  })
})

describe('skip rules', () => {
  it.each([
    ['unpublished', goodEvent({ _status: 'draft' })],
    ['finished', goodEvent({ verificationStage: 'finished' })],
    ['expired', goodEvent({ verificationStage: 'expired', _status: 'draft' })],
    ['trashed', goodEvent({ deletedAt: '2026-01-01T00:00:00.000Z' })],
  ])('skips a %s event with that reason', (reason, event) => {
    expect(shouldSkipQualityChecks(event)).toBe(reason)
    expect(buildEventQualityReport(event, { now: NOW })).toEqual({ skipped: true, reason })
  })

  it('reports the actionable reason when several apply', () => {
    // An expired event is also unpublished; "expired" is what a manager can act on.
    expect(
      shouldSkipQualityChecks(goodEvent({ verificationStage: 'expired', _status: 'draft' })),
    ).toBe('expired')
  })
})

describe('openCount', () => {
  it('counts the failing checks', () => {
    const event = goodEvent({ images: [], title: 'Meditation' })
    const report = buildEventQualityReport(event, { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    expect(report.openCount).toBe(2)
    expect(countOpenDocumentIssues(event, NOW)).toBe(2)
  })

  it('reports an empty listing as the two things it is actually missing', () => {
    // description.quality is skipped while the description is absent, and
    // title.quality is skipped without a hand-written title — so a bare listing
    // yields two findings rather than every check at once.
    const empty: EventQualityInput = { _status: 'published', verificationStage: 'verified' }
    const report = buildEventQualityReport(empty, { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    expect(report.checks.filter((r) => r.status === 'failed').map((r) => r.key)).toEqual([
      'description.missing',
      'images.insufficient',
    ])
  })

  it('is zero for a skipped event', () => {
    expect(countOpenDocumentIssues(goodEvent({ _status: 'draft' }), NOW)).toBe(0)
  })
})
