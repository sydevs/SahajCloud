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

  it('keeps every description to a single sentence', () => {
    // The panel prints these under each open recommendation; a paragraph there
    // turns the sidebar into a wall of text.
    const tooLong = EVENT_QUALITY_CHECKS.filter(
      (check) => (check.description.match(/[.!?](\s|$)/g) ?? []).length > 1,
    )
    expect(tooLong.map((c) => c.key)).toEqual([])
  })

  it('keeps every key unique', () => {
    const keys = EVENT_QUALITY_CHECKS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('implements exactly the v1 check set', () => {
    expect(EVENT_QUALITY_CHECKS.map((c) => c.key).sort()).toEqual(
      [
        'contact.none',
        'description.insufficient',
        'description.redundant',
        'images.missing',
        'title.unhelpful',
        'translation.title.missing',
      ].sort(),
    )
  })

  it('passes a complete listing on every check', () => {
    expect(failedKeys(goodEvent())).toEqual([])
  })
})

describe('completeness checks', () => {
  it('folds an absent and a too-thin description into one finding', () => {
    // Presence and length are the same conversation — "there isn't enough here
    // to go on" — so they're one row with a detail that says which.
    const absent = buildEventQualityReport(goodEvent({ description: null }), { now: NOW })
    if (absent.skipped) throw new Error('expected a report')
    const absentItem = absent.document.find((r) => r.key === 'description.insufficient')
    expect(absentItem?.status).toBe('failed')
    expect(absentItem?.detail).toContain('Nothing here yet')

    const short = buildEventQualityReport(goodEvent({ description: richText('Meditation.') }), {
      now: NOW,
    })
    if (short.skipped) throw new Error('expected a report')
    const shortItem = short.document.find((r) => r.key === 'description.insufficient')
    expect(shortItem?.status).toBe('failed')
    expect(shortItem?.detail).toContain('Too short')
  })

  it('flags missing images', () => {
    expect(failedKeys(goodEvent({ images: [] }))).toEqual(['images.missing'])
  })

  it('does not ask for a website — it is optional by design', () => {
    // A listing that says everything in place beats one that sends a seeker
    // to an external site, so its absence is not a finding.
    expect(failedKeys(goodEvent({ website: null }))).toEqual([])
  })

  it('flags an event with no contact route at all', () => {
    const stranded = goodEvent({
      contactPhone: null,
      contactEmail: null,
      website: null,
      onlineUrl: null,
    })
    expect(failedKeys(stranded)).toEqual(['contact.none'])
  })

  it('accepts an online link as the contact route', () => {
    const online = goodEvent({ contactPhone: null, contactEmail: null, website: null })
    expect(failedKeys({ ...online, onlineUrl: 'https://meet.example.org/room' })).toEqual([])
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
    expect(failedKeys(handTyped)).toContain('title.unhelpful')
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

  it('treats hand-written prose as hand-written', () => {
    expect(isAutoFilledTitle('Meditation for Night-Shift Nurses', goodEvent())).toBe(false)
  })
})

describe('title quality — one finding, named causes', () => {
  const detailFor = (event: EventQualityInput, key: string) => {
    const report = buildEventQualityReport(event, { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    return Object.values(report.perLocale)
      .flat()
      .find((r) => r.key === key)?.detail
  }

  it('names a generic title', () => {
    expect(detailFor(goodEvent({ title: 'Meditation' }), 'title.unhelpful')).toContain(
      'only says "Meditation"',
    )
  })

  it('names a title that is only the address', () => {
    for (const title of ['Friends Meeting House', '9 St Peter Park Rd', 'Broadstairs']) {
      expect(detailFor(goodEvent({ title }), 'title.unhelpful')).toContain('just the address')
    }
  })

  it('names a day or time written into the title', () => {
    expect(detailFor(goodEvent({ title: 'Meditation every Tuesday' }), 'title.unhelpful')).toContain(
      'day or time',
    )
    expect(detailFor(goodEvent({ title: 'Meditation at 19:30' }), 'title.unhelpful')).toContain(
      'day or time',
    )
  })

  it('tells the manager the fix is to clear the field', () => {
    expect(detailFor(goodEvent({ title: 'Meditation' }), 'title.unhelpful')).toContain('Clearing it')
  })

  it('leaves a title that says something of its own alone', () => {
    expect(failedKeys(goodEvent({ title: 'Beginners evening at Friends Meeting House' }))).toEqual(
      [],
    )
    expect(failedKeys(goodEvent({ title: 'Free Meditation Classes for Students' }))).toEqual([])
  })
})

describe('description quality — one finding, named causes', () => {
  const detailFor = (...paragraphs: string[]) => {
    const report = buildEventQualityReport(goodEvent({ description: richText(...paragraphs) }), {
      now: NOW,
    })
    if (report.skipped) throw new Error('expected a report')
    return report.document.find((r) => r.key === 'description.redundant')?.detail
  }

  it('names a repeated address', () => {
    expect(
      detailFor(
        'We meet at Friends Meeting House every week, and everyone is welcome to come along.',
      ),
    ).toContain('the address')
  })

  it('names a repeated schedule', () => {
    expect(
      detailFor('Our sessions run on Thursday, and beginners are welcome at any point.'),
    ).toContain('the day and time')
    expect(
      detailFor('Doors open at 18:45 and the guided session itself starts a little later.'),
    ).toContain('the day and time')
  })

  it('names contact details in prose', () => {
    expect(
      detailFor('Ring us on +44 20 7946 0000 to ask about the class before you come along.'),
    ).toContain('phone number or email')
    expect(
      detailFor('Write to hello@example.org if you would like to know more before coming.'),
    ).toContain('phone number or email')
  })

  it('names a link', () => {
    expect(
      detailFor('Everything else is on https://example.org/classes for you to read first.'),
    ).toContain('the web link')
  })

  it('names a date that has passed', () => {
    expect(
      detailFor('We have been running these sessions here every week since 2019 or so.'),
    ).toContain('date that has passed')
  })

  it('lists several problems in one sentence', () => {
    const detail = detailFor(
      'Meet at Friends Meeting House on Thursday, or ring +44 20 7946 0000 to ask first.',
    )
    expect(detail).toContain('the address')
    expect(detail).toContain('the day and time')
    expect(detail).toContain(' and ')
  })

  it('allows 1970 — the founding year, not a schedule', () => {
    expect(
      detailFor('Sahaja Yoga was founded in 1970 and has been taught freely ever since here.'),
    ).toBeUndefined()
  })

  it('reads text across formatting runs without inventing phrases', () => {
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
    expect(failedKeys(goodEvent({ description: split }))).toContain('description.redundant')
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

  it('never calls an auto-filled title untranslated', () => {
    // A blank title is composed per locale from that locale's own template, so
    // every language already has its own — there is nothing to translate. Only
    // a title a manager typed can leave other languages showing English.
    const autoFilled = goodEvent({
      languages: ['de', 'fr'],
      title: { en: 'Meditation at Friends Meeting House' },
    })
    const report = buildEventQualityReport(autoFilled, { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    for (const locale of ['de', 'fr']) {
      expect(report.perLocale[locale]).toContainEqual({
        key: 'translation.title.missing',
        status: 'passed',
      })
    }
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

  it('reports an empty listing as the three things it is actually missing', () => {
    // description.redundant stays silent on an empty description, so a bare
    // listing yields three findings rather than every check at once.
    const empty: EventQualityInput = { _status: 'published', verificationStage: 'verified' }
    const report = buildEventQualityReport(empty, { now: NOW })
    if (report.skipped) throw new Error('expected a report')
    expect(report.document.filter((r) => r.status === 'failed').map((r) => r.key)).toEqual([
      'description.insufficient',
      'images.missing',
      'contact.none',
    ])
    expect(report.openCount).toBeLessThanOrEqual(DOCUMENT_SCOPE_CHECKS.length)
  })

  it('is zero for a skipped event', () => {
    expect(countOpenDocumentIssues(goodEvent({ _status: 'draft' }), NOW)).toBe(0)
  })
})
