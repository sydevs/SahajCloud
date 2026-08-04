import { describe, expect, it } from 'vitest'

import type { EventQualityInput } from '@/lib/eventQuality'

import {
  buildEventQualityReport,
  countOpenDocumentIssues,
  DESCRIPTION_MIN_LENGTH,
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
  images: [1],
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
  it('gives every check a label and a description', () => {
    // Without this, a check added later renders in the panel as a bare key.
    const unlabelled = EVENT_QUALITY_CHECKS.filter(
      (check) => !check.label?.trim() || !check.description?.trim(),
    )
    expect(unlabelled.map((c) => c.key)).toEqual([])
  })

  it('keeps every key unique', () => {
    const keys = EVENT_QUALITY_CHECKS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('implements exactly the v1 check set', () => {
    expect(EVENT_QUALITY_CHECKS.map((c) => c.key).sort()).toEqual(
      [
        'contact.none',
        'description.containsUrl',
        'description.missing',
        'description.repeatsAddress',
        'description.repeatsContact',
        'description.repeatsSchedule',
        'description.staleDate',
        'description.tooShort',
        'images.missing',
        'title.generic',
        'title.restatesAddress',
        'title.restatesSchedule',
        'translation.title.missing',
        'website.missing',
      ].sort(),
    )
  })

  it('passes a complete listing on every check', () => {
    expect(failedKeys(goodEvent())).toEqual([])
  })
})

describe('completeness checks', () => {
  it('flags a missing description, and nothing else about it', () => {
    // The other five description checks are vacuous on an empty description —
    // one finding, not six saying the same thing.
    expect(failedKeys(goodEvent({ description: null }))).toEqual(['description.missing'])
  })

  it('flags missing images', () => {
    expect(failedKeys(goodEvent({ images: [] }))).toEqual(['images.missing'])
  })

  it('flags a missing website', () => {
    expect(failedKeys(goodEvent({ website: null }))).toEqual(['website.missing'])
  })

  it('flags an event with no contact route at all', () => {
    const stranded = goodEvent({
      contactPhone: null,
      contactEmail: null,
      website: null,
      onlineUrl: null,
    })
    expect(failedKeys(stranded).sort()).toEqual(['contact.none', 'website.missing'])
  })

  it('accepts an online link as the contact route', () => {
    const online = goodEvent({ contactPhone: null, contactEmail: null, website: null })
    expect(failedKeys({ ...online, onlineUrl: 'https://meet.example.org/room' })).toEqual([
      'website.missing',
    ])
  })
})

describe('title quality — auto-filled titles are never judged', () => {
  const address = { venueName: 'Sunrise Hall', street: 'Hauptstr 1', city: 'Bremen' }

  it('produces zero title-tier items for a blank (hence auto-filled) title', () => {
    // The manager left the title blank, so eventTitleBeforeChange stored the
    // composed auto-title. Recomposing it must recognise it as auto-filled —
    // this is the assertion that proves #605's decision didn't regress.
    const autoFilled = goodEvent({ title: 'Meditation at Sunrise Hall', address })
    expect(failedKeys(autoFilled)).toEqual([])
  })

  it('flags the same event once the title is hand-typed "Meditation"', () => {
    const handTyped = goodEvent({ title: 'Meditation', address })
    expect(failedKeys(handTyped)).toContain('title.generic')
  })

  it('recognises every slot, not just the one the schedule implies', () => {
    // A schedule edited from evening to morning leaves the stored title on the
    // old template; it is still auto-filled.
    for (const template of Object.values(EVENT_TITLE_DEFAULTS)) {
      const title = template.replace('%{place}', 'Friends Meeting House')
      expect(isAutoFilledTitle(title, goodEvent())).toBe(true)
    }
  })

  it('recognises a localized auto-title via the locale’s own templates', () => {
    const german = { ...EVENT_TITLE_DEFAULTS, evening: 'Abendmeditation bei %{place}' }
    expect(
      isAutoFilledTitle('Abendmeditation bei Friends Meeting House', goodEvent(), german),
    ).toBe(true)
    // Without the German templates it reads as hand-written prose.
    expect(isAutoFilledTitle('Abendmeditation bei Friends Meeting House', goodEvent())).toBe(false)
  })

  it('treats hand-written prose as hand-written', () => {
    expect(isAutoFilledTitle('Meditation for Night-Shift Nurses', goodEvent())).toBe(false)
  })
})

describe('title quality — hand-written titles', () => {
  it('flags a title that is only the venue, street or city', () => {
    for (const title of ['Friends Meeting House', '9 St Peter Park Rd', 'Broadstairs']) {
      expect(failedKeys(goodEvent({ title }))).toContain('title.restatesAddress')
    }
  })

  it('leaves a title that merely mentions the venue alone', () => {
    // "just the address" is the failure — a title that says something more is
    // doing its job, even if the venue appears in it. "evening" is a time of
    // day, not a weekday or a clock time, so the schedule check stays quiet.
    expect(failedKeys(goodEvent({ title: 'Beginners evening at Friends Meeting House' }))).toEqual(
      [],
    )
  })

  it('flags a weekday or a time written into the title', () => {
    expect(failedKeys(goodEvent({ title: 'Meditation every Tuesday' }))).toContain(
      'title.restatesSchedule',
    )
    expect(failedKeys(goodEvent({ title: 'Meditation at 19:30' }))).toContain(
      'title.restatesSchedule',
    )
  })

  it('flags a non-English weekday too', () => {
    expect(failedKeys(goodEvent({ title: 'Meditation jeden Dienstag' }))).toContain(
      'title.restatesSchedule',
    )
  })

  it('accepts a generic title once it names an audience', () => {
    expect(failedKeys(goodEvent({ title: 'Free Meditation Classes' }))).toContain('title.generic')
    expect(failedKeys(goodEvent({ title: 'Free Meditation Classes for Students' }))).toEqual([])
  })
})

describe('description quality', () => {
  const withDescription = (...paragraphs: string[]) =>
    failedKeys(goodEvent({ description: richText(...paragraphs) }))

  it('flags prose repeating the address', () => {
    expect(
      withDescription(
        'We meet at Friends Meeting House every week, and everyone is welcome to come along.',
      ),
    ).toContain('description.repeatsAddress')
  })

  it('flags prose repeating the schedule', () => {
    expect(
      withDescription('Our sessions run on Thursday, and beginners are welcome at any point.'),
    ).toContain('description.repeatsSchedule')
    expect(
      withDescription('Doors open at 18:45 and the guided session itself starts a little later.'),
    ).toContain('description.repeatsSchedule')
  })

  it('flags a phone number or an email in prose', () => {
    expect(
      withDescription('Ring us on +44 20 7946 0000 to ask about the class before you come along.'),
    ).toContain('description.repeatsContact')
    expect(
      withDescription('Write to hello@example.org if you would like to know more before coming.'),
    ).toContain('description.repeatsContact')
  })

  it('flags a URL in prose — it renders as dead text', () => {
    expect(
      withDescription('Everything else is on https://example.org/classes for you to read first.'),
    ).toContain('description.containsUrl')
    expect(
      withDescription('Everything else is on www.example.org/classes for you to read first.'),
    ).toContain('description.containsUrl')
  })

  it('flags a year or a date that has already passed', () => {
    expect(
      withDescription('We have been running these sessions here every week since 2019 or so.'),
    ).toContain('description.staleDate')
    expect(
      withDescription('The programme was last revised on 2024-03-12 and has run since then.'),
    ).toContain('description.staleDate')
  })

  it('allows 1970 — the founding year, not a schedule', () => {
    expect(
      withDescription('Sahaja Yoga was founded in 1970 and has been taught freely ever since.'),
    ).not.toContain('description.staleDate')
  })

  it('allows the current and future years', () => {
    expect(
      withDescription('A new beginners course starts in 2027, open to anyone who wants to come.'),
    ).not.toContain('description.staleDate')
  })

  it('flags a description under the minimum length', () => {
    const short = 'Meditation class.'
    expect(short.length).toBeLessThan(DESCRIPTION_MIN_LENGTH)
    expect(withDescription(short)).toEqual(['description.tooShort'])
  })

  it('reads text across formatting runs without inventing phrases', () => {
    // Sibling text nodes join with nothing (so a bolded word doesn't split a
    // phrase), but blocks join with a newline (so a heading can't run into the
    // paragraph below and manufacture one).
    const split = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Come to ', version: 1 },
              { type: 'text', text: 'Friends Meeting House', format: 1, version: 1 },
              { type: 'text', text: ' whenever you like, no booking needed at all.', version: 1 },
            ],
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      },
    }
    expect(failedKeys(goodEvent({ description: split }))).toContain('description.repeatsAddress')
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

  it('flags a language with no title of its own', () => {
    const report = buildEventQualityReport(
      goodEvent({ languages: ['de'], title: { en: 'Meditation for Nurses' } }),
      { now: NOW },
    )
    if (report.skipped) throw new Error('expected a report')
    expect(report.perLocale.de).toContainEqual({
      key: 'translation.title.missing',
      status: 'failed',
    })
    expect(report.perLocale.en).toContainEqual({
      key: 'translation.title.missing',
      status: 'passed',
    })
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
    // images.missing + website.missing — title.generic is per-locale.
    expect(report.openCount).toBe(2)
    expect(countOpenDocumentIssues(event, NOW)).toBe(2)
  })

  it('reports an empty listing as the four things it is actually missing', () => {
    // The six description-quality checks stay silent on an empty description,
    // so a bare listing yields four findings rather than every check at once.
    const empty: EventQualityInput = { _status: 'published', verificationStage: 'verified' }
    const report = buildEventQualityReport(empty, { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    expect(report.document.filter((r) => r.status === 'failed').map((r) => r.key)).toEqual([
      'description.missing',
      'images.missing',
      'website.missing',
      'contact.none',
    ])
    expect(report.openCount).toBeLessThanOrEqual(DOCUMENT_SCOPE_CHECKS.length)
  })

  it('is zero for a skipped event', () => {
    expect(countOpenDocumentIssues(goodEvent({ _status: 'draft' }), NOW)).toBe(0)
  })
})
