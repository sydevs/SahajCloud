import { describe, expect, it } from 'vitest'

import type { EventQualityInput } from '@/lib/eventQuality'
import {
  buildEventQualityReport,
  countOpenDocumentIssues,
  DOCUMENT_SCOPE_CHECKS,
  EVENT_QUALITY_CHECKS,
  isAutoFilledTitle,
  localeForLanguage,
  qualityLocalesForEvent,
  shouldSkipQualityChecks,
  titleForLocale,
} from '@/lib/eventQuality'
import { EVENT_TITLE_DEFAULTS } from '@/lib/eventTitle/compose'

/** Fixed clock so the stale-date check can't drift with the calendar. */
const NOW = new Date('2026-06-15T00:00:00.000Z')

/** Lexical value for a plain paragraph, as the Atlas importer writes them. */
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
  website: 'https://example.org/nurses',
  contactPhone: '+44 20 7946 0000',
  contactEmail: 'hello@example.org',
  address: {
    venueName: 'Friends Meeting House',
    street: '9 St Peter Park Rd',
    city: 'Broadstairs',
  },
  ...overrides,
})

/** Keys of the checks that failed, across document scope and every locale. */
const failedKeys = (event: EventQualityInput, options = {}) => {
  const report = buildEventQualityReport(event, { now: NOW, ...options })
  if (report.skipped) throw new Error(`expected a report, got skipped: ${report.reason}`)
  return [
    ...report.document.filter((r) => r.status === 'failed').map((r) => r.key),
    ...Object.values(report.perLocale)
      .flat()
      .filter((r) => r.status === 'failed')
      .map((r) => r.key),
  ]
}

describe('registry integrity', () => {
  it('gives every check a label, a passing label and a description', () => {
    // Without this, a check added later renders in the panel as a bare key —
    // and a missing passedLabel would put a tick beside an instruction, which
    // reads as an endorsement of the thing we're asking them to stop doing.
    const unlabelled = EVENT_QUALITY_CHECKS.filter(
      (check) => !check.label?.trim() || !check.passedLabel?.trim() || !check.description?.trim(),
    )
    expect(unlabelled.map((c) => c.key)).toEqual([])
  })

  it('words the passing label as a state, not as an instruction', () => {
    // "The description repeats the address" beside a tick said the opposite of
    // what was meant. A passing label must never be the imperative one.
    const sameBothWays = EVENT_QUALITY_CHECKS.filter((c) => c.passedLabel === c.label)
    expect(sameBothWays.map((c) => c.key)).toEqual([])
  })

  it('gives every per-locale check a language-named wording', () => {
    // Multilingual events name the language inline ("Add a German title"), so
    // both wordings need the placeholder the panel bolds.
    const missing = EVENT_QUALITY_CHECKS.filter(
      (check) =>
        check.scope === 'perLocale' &&
        (!check.localeLabel?.includes('%{language}') ||
          !check.localePassedLabel?.includes('%{language}')),
    )
    expect(missing.map((c) => c.key)).toEqual([])
  })

  it('never puts an article straight before the language name', () => {
    // "Add a %{language} title" renders "Add a English title". Phrase around it.
    const ungrammatical = EVENT_QUALITY_CHECKS.filter((check) =>
      [check.localeLabel, check.localePassedLabel].some((label) =>
        /\b(a|an)\s+%\{language\}/i.test(label ?? ''),
      ),
    )
    expect(ungrammatical.map((c) => c.key)).toEqual([])
  })

  it('keeps every key unique', () => {
    const keys = EVENT_QUALITY_CHECKS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('implements exactly the v1 check set', () => {
    expect(EVENT_QUALITY_CHECKS.map((c) => c.key).sort()).toEqual(
      [
        'description.missing',
        'description.quality',
        'images.insufficient',
        'title.quality',
        'translations.missing',
      ].sort(),
    )
  })

  it('passes a complete listing on every check', () => {
    expect(failedKeys(goodEvent())).toEqual([])
  })
})

describe('description checks', () => {
  const documentResult = (event: EventQualityInput, key: string) => {
    const report = buildEventQualityReport(event, { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    return report.document.find((r) => r.key === key)
  }

  it('asks for a description when there is none, and when there is barely one', () => {
    expect(documentResult(goodEvent({ description: null }), 'description.missing')?.status).toBe(
      'failed',
    )
    expect(
      documentResult(goodEvent({ description: richText('Meditation.') }), 'description.missing')
        ?.status,
    ).toBe('failed')
    expect(documentResult(goodEvent(), 'description.missing')?.status).toBe('passed')
  })

  it('names exactly what the description repeats', () => {
    const cases: [string, string][] = [
      ['We meet at Friends Meeting House every week, and everyone is welcome here.', 'the address'],
      ['Our sessions run on Thursday, and beginners are welcome at any point.', 'the day or time'],
      ['Ring us on +44 20 7946 0000 to ask about the class before you come along.', 'a phone number or email'],
      ['Everything else is on https://example.org/classes for you to read before.', 'a web link'],
      ['We have been running these sessions here every week since 2019 or so now.', 'a date that has passed'],
    ]
    for (const [text, expected] of cases) {
      const result = documentResult(
        goodEvent({ description: richText(text) }),
        'description.quality',
      )
      expect(result?.status).toBe('failed')
      expect(result?.detail).toContain(expected)
    }
  })

  it('lists several repeats in one sentence', () => {
    const result = documentResult(
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
      documentResult(
        goodEvent({
          description: richText(
            'Sahaja Yoga was founded in 1970 and has been taught freely ever since here.',
          ),
        }),
        'description.quality',
      )?.status,
    ).toBe('passed')
  })
})

describe('image count', () => {
  it.each([
    [0, 'failed'],
    [2, 'failed'],
    [3, 'passed'],
    [5, 'passed'],
  ])('with %i images the check is %s', (count, status) => {
    const report = buildEventQualityReport(
      goodEvent({ images: Array.from({ length: count as number }, (_, i) => i + 1) }),
      { now: NOW },
    )
    if (report.skipped) throw new Error('expected a report')
    expect(report.document.find((r) => r.key === 'images.insufficient')?.status).toBe(status)
  })
})

describe('title quality', () => {
  const address = { venueName: 'Sunrise Hall', street: 'Hauptstr 1', city: 'Bremen' }

  const localeResult = (event: EventQualityInput, key: string) => {
    const report = buildEventQualityReport(event, { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    return Object.values(report.perLocale)
      .flat()
      .find((r) => r.key === key)
  }

  it('is skipped entirely for a blank (hence auto-filled) title', () => {
    // The manager left the title blank, so eventTitleBeforeChange stored the
    // composed auto-title — there is no wording of theirs to judge.
    const autoFilled = goodEvent({ title: 'Meditation at Sunrise Hall', address })
    expect(localeResult(autoFilled, 'title.quality')).toBeUndefined()
  })

  it('recognises every slot, not just the one the schedule implies', () => {
    for (const template of Object.values(EVENT_TITLE_DEFAULTS)) {
      const title = template.replace('%{place}', 'Friends Meeting House')
      expect(isAutoFilledTitle(title, goodEvent())).toBe(true)
    }
  })

  it('recognises a localized auto-title via the locale\u2019s own templates', () => {
    const german = { ...EVENT_TITLE_DEFAULTS, evening: 'Abendmeditation bei %{place}' }
    expect(
      isAutoFilledTitle('Abendmeditation bei Friends Meeting House', goodEvent(), german),
    ).toBe(true)
    expect(isAutoFilledTitle('Abendmeditation bei Friends Meeting House', goodEvent())).toBe(false)
  })

  it('flags a generic hand-typed title and points at the blank field', () => {
    const result = localeResult(goodEvent({ title: 'Meditation', address }), 'title.quality')
    expect(result?.status).toBe('failed')
    expect(result?.detail).toContain('Leave it blank')
  })

  it('names exactly what the title repeats', () => {
    const cases: [string, string][] = [
      ['Friends Meeting House', 'the address'],
      ['Meditation every Tuesday', 'the day or time'],
      ['Meditation — call +44 20 7946 0000', 'contact details'],
      ['Meditation since 2019', 'a date that has passed'],
    ]
    for (const [title, expected] of cases) {
      const result = localeResult(goodEvent({ title }), 'title.quality')
      expect(result?.status).toBe('failed')
      expect(result?.detail).toContain(expected)
    }
  })

  it('leaves a title that says something of its own alone', () => {
    expect(localeResult(goodEvent({ title: 'Beginners evening at Sunrise Hall' }), 'title.quality')?.status).toBe(
      'passed',
    )
    expect(
      localeResult(goodEvent({ title: 'Free Meditation Classes for Students' }), 'title.quality')
        ?.status,
    ).toBe('passed')
  })
})

describe('translations', () => {
  const translationResult = (event: EventQualityInput) => {
    const report = buildEventQualityReport(event, { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    return report.document.find((r) => r.key === 'translations.missing')
  }

  it('says nothing for a single-language event', () => {
    expect(translationResult(goodEvent({ languages: ['en'] }))?.status).toBe('passed')
  })

  it('names the languages a written title is missing from', () => {
    const result = translationResult(
      goodEvent({ languages: ['de', 'fr'], title: { en: 'Meditation for Nurses' } }),
    )
    expect(result?.status).toBe('failed')
    expect(result?.detail).toContain('German')
    expect(result?.detail).toContain('French')
    expect(result?.detail).toContain('title')
  })

  it('says nothing when no language has a title — the auto-fill covers them all', () => {
    // A blank title is composed per locale from that locale's own template, so
    // every language already has its own. There is nothing to translate.
    expect(translationResult(goodEvent({ languages: ['de', 'fr'], title: {} }))?.status).toBe(
      'passed',
    )
  })

  it('ignores a language added in the save currently in flight', () => {
    // The manager just ticked German. A translation cannot exist yet, and
    // scolding them for the edit they are making would be absurd.
    const event = goodEvent({ languages: ['de'], title: { en: 'Meditation for Nurses' } })
    const during = buildEventQualityReport(event, { now: NOW, pendingLocales: ['de'] })
    if (during.skipped) throw new Error('expected a report')
    expect(during.document.find((r) => r.key === 'translations.missing')?.status).toBe('passed')

    // Once the save is over it is a real finding.
    expect(translationResult(event)?.status).toBe('failed')
  })

  it('says nothing once every language has one', () => {
    expect(
      translationResult(
        goodEvent({
          languages: ['de'],
          title: { en: 'Meditation for Nurses', de: 'Meditation für Pflegende' },
        }),
      )?.status,
    ).toBe('passed')
  })
})

describe('locale scope', () => {
  it('judges an event with languages: ["de"] in en + de only', () => {
    const report = buildEventQualityReport(goodEvent({ languages: ['de'] }), { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    expect(report.locales).toEqual(['en', 'de'])
    expect(Object.keys(report.perLocale).sort()).toEqual(['de', 'en'])
  })

  it('maps a language code onto the CMS locale it belongs to', () => {
    expect(localeForLanguage('de')).toBe('de')
    // The 19 CMS locales carry Brazilian Portuguese, not bare `pt`.
    expect(localeForLanguage('pt')).toBe('pt-BR')
    expect(localeForLanguage('PT-br')).toBe('pt-BR')
    // Not a locale the CMS is translated into — nothing to be missing.
    expect(localeForLanguage('sw')).toBeNull()
  })

  it('always includes the default locale, and never duplicates it', () => {
    expect(qualityLocalesForEvent(goodEvent({ languages: ['en', 'en-AU'] }))).toEqual([
      'en',
      'en-AU',
    ])
    expect(qualityLocalesForEvent(goodEvent({ languages: [] }))).toEqual(['en'])
  })



  it('reports a locale added in the current save as pending, not failing', () => {
    // The manager just ticked "German". A translation cannot exist yet, and
    // scolding them for the edit they are making would be absurd.
    const report = buildEventQualityReport(
      goodEvent({ languages: ['de'], title: { en: 'Meditation for Nurses' } }),
      { now: NOW, pendingLocales: ['de'] },
    )
    if (report.skipped) throw new Error('expected a report')
    expect(report.perLocale.de.every((r) => r.status === 'pending')).toBe(true)
    expect(report.perLocale.en.some((r) => r.status === 'pending')).toBe(false)
  })

  it('reads a per-locale title map, and a single-locale string only for its own locale', () => {
    expect(titleForLocale({ en: 'A', de: 'B' }, 'de')).toBe('B')
    expect(titleForLocale('A', 'en')).toBe('A')
    expect(titleForLocale('A', 'de')).toBe('')
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
    // An expired event is also unpublished; "expired" is what the manager can act on.
    expect(
      shouldSkipQualityChecks(goodEvent({ verificationStage: 'expired', _status: 'draft' })),
    ).toBe('expired')
  })
})

describe('openCount', () => {
  it('counts document-scope failures only', () => {
    const event = goodEvent({ images: [], website: null, title: 'Meditation' })
    const report = buildEventQualityReport(event, { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    // images.missing only — title.generic is per-locale, and a missing website
    // is not a finding.
    expect(report.openCount).toBe(1)
    expect(countOpenDocumentIssues(event, NOW)).toBe(1)
  })

  it('reports an empty listing as the two things it is actually missing', () => {
    // description.quality stays silent on an empty description, and a
    // single-language event has nothing to translate — so a bare listing yields
    // two findings rather than every check at once.
    const empty: EventQualityInput = { _status: 'published', verificationStage: 'verified' }
    const report = buildEventQualityReport(empty, { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    expect(report.document.filter((r) => r.status === 'failed').map((r) => r.key)).toEqual([
      'description.missing',
      'images.insufficient',
    ])
    expect(report.openCount).toBeLessThanOrEqual(DOCUMENT_SCOPE_CHECKS.length)
  })

  it('is zero for a skipped event', () => {
    expect(countOpenDocumentIssues(goodEvent({ _status: 'draft' }), NOW)).toBe(0)
  })
})
