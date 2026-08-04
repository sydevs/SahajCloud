/**
 * Unit tests for the email translation resolver.
 *
 * Covers the two fallback layers separately, since they catch different
 * failures: Payload's own locale fallback (a wholly untranslated locale) and
 * the English key defaults (a partially translated locale, an unfilled key, or
 * an empty global). Plus the contract between those defaults and the schema
 * that decides what a translator can fill in.
 */
import type { Payload } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { PLURAL_CATEGORIES } from '@/fields/translationsField'
import atlasSchema from '@/globals/SahajAtlasTranslations/translationsSchema.json' with { type: 'json' }
import {
  EMAIL_STRING_DEFAULTS,
  type EmailStrings,
  interpolate,
  pluralize,
  resolveEmailStrings,
} from '@/lib/translations/emailStrings'

/** One string key as declared in `translationsSchema.json`. */
interface EmailKeySchema {
  type: string
  plural?: boolean
}

/** A stub Payload whose `findGlobal` returns the given `emails` blob. */
function stubPayload(emails: unknown, opts: { reject?: boolean } = {}) {
  const findGlobal = opts.reject
    ? vi.fn().mockRejectedValue(new Error('db down'))
    : vi.fn().mockResolvedValue({ emails })
  return {
    findGlobal,
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  } as unknown as Payload & { findGlobal: ReturnType<typeof vi.fn> }
}

describe('interpolate', () => {
  it('substitutes %{...} placeholders', () => {
    expect(interpolate('Hi %{name}, welcome', { name: 'Jo' })).toBe('Hi Jo, welcome')
  })

  it('substitutes numbers and repeated placeholders', () => {
    expect(interpolate('%{count} of %{count}', { count: 8 })).toBe('8 of 8')
  })

  it('leaves an unknown placeholder intact so the copy error is visible', () => {
    expect(interpolate('Hi %{nope}', { name: 'Jo' })).toBe('Hi %{nope}')
  })
})

describe('pluralize', () => {
  // Forms that name their own CLDR category, so the selected one is visible in
  // the output. (In production these are localized copy, not category labels.)
  const strings: EmailStrings = {
    ...EMAIL_STRING_DEFAULTS,
    sessions_count_one: 'ONE:%{count}',
    sessions_count_few: 'FEW:%{count}',
    sessions_count_many: 'MANY:%{count}',
    sessions_count_other: 'OTHER:%{count}',
  }

  it('selects English one/other and interpolates the count', () => {
    expect(pluralize(strings, 'sessions_count', 1, 'en')).toBe('ONE:1')
    expect(pluralize(strings, 'sessions_count', 8, 'en')).toBe('OTHER:8')
  })

  it('defaults to English when no locale is given', () => {
    expect(pluralize(strings, 'sessions_count', 2)).toBe('OTHER:2')
  })

  it('selects Russian one/few/many by CLDR', () => {
    // ru: 1,21 → one; 2–4 → few; 5–20 → many
    expect(pluralize(strings, 'sessions_count', 1, 'ru')).toBe('ONE:1')
    expect(pluralize(strings, 'sessions_count', 2, 'ru')).toBe('FEW:2')
    expect(pluralize(strings, 'sessions_count', 5, 'ru')).toBe('MANY:5')
    expect(pluralize(strings, 'sessions_count', 21, 'ru')).toBe('ONE:21')
  })

  it('selects Ukrainian one/few/many by CLDR', () => {
    expect(pluralize(strings, 'sessions_count', 1, 'uk')).toBe('ONE:1')
    expect(pluralize(strings, 'sessions_count', 3, 'uk')).toBe('FEW:3')
    expect(pluralize(strings, 'sessions_count', 8, 'uk')).toBe('MANY:8')
  })

  it('selects Czech one/few/other — integer 5 is `other`, not `many`', () => {
    // cs integers: 1 → one; 2–4 → few; 5+ → other (many is fractions only)
    expect(pluralize(strings, 'sessions_count', 1, 'cs')).toBe('ONE:1')
    expect(pluralize(strings, 'sessions_count', 3, 'cs')).toBe('FEW:3')
    expect(pluralize(strings, 'sessions_count', 5, 'cs')).toBe('OTHER:5')
  })

  it('falls back to _other when the selected form is missing', () => {
    // Russian 2 → few, but with `few` absent it must fall back, not blank out.
    const partial = { ...strings } as Record<string, string>
    delete partial.sessions_count_few
    expect(pluralize(partial as unknown as EmailStrings, 'sessions_count', 2, 'ru')).toBe('OTHER:2')
  })

  it('renders the real English defaults with correct singular/plural', () => {
    // Also fixes the pre-plural bug where a single session read "1 sessions".
    expect(pluralize(EMAIL_STRING_DEFAULTS, 'sessions_count', 1, 'en')).toBe('1 session')
    expect(pluralize(EMAIL_STRING_DEFAULTS, 'sessions_count', 8, 'en')).toBe('8 sessions')
  })
})

describe('resolveEmailStrings', () => {
  it('returns the translated strings for a locale', async () => {
    const payload = stubPayload({ confirmation_heading: 'Du bist angemeldet' })

    const strings = await resolveEmailStrings({ payload, locale: 'de' })

    expect(strings.confirmation_heading).toBe('Du bist angemeldet')
    expect(payload.findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'sy-atlas-translations', locale: 'de' }),
    )
  })

  it('falls back to English per key when a locale is only partly translated', async () => {
    // Payload falls back per *field*, not per key — a blob that exists but omits
    // a key would otherwise resolve to undefined and render blank.
    const strings = await resolveEmailStrings({
      payload: stubPayload({ confirmation_heading: 'Du bist angemeldet' }),
      locale: 'de',
    })

    expect(strings.confirmation_heading).toBe('Du bist angemeldet')
    expect(strings.when_label).toBe(EMAIL_STRING_DEFAULTS.when_label)
    expect(strings.footer_reason).toBe(EMAIL_STRING_DEFAULTS.footer_reason)
  })

  it('ignores blank and non-string values', async () => {
    const strings = await resolveEmailStrings({
      payload: stubPayload({ when_label: '   ', where_label: 42, about_label: null }),
    })

    expect(strings.when_label).toBe(EMAIL_STRING_DEFAULTS.when_label)
    expect(strings.where_label).toBe(EMAIL_STRING_DEFAULTS.where_label)
    expect(strings.about_label).toBe(EMAIL_STRING_DEFAULTS.about_label)
  })

  it('returns full English defaults when the global has no emails group', async () => {
    const strings = await resolveEmailStrings({ payload: stubPayload(undefined) })
    expect(strings).toEqual(EMAIL_STRING_DEFAULTS)
  })

  it('defaults to the `en` locale when none is given', async () => {
    const payload = stubPayload({})
    await resolveEmailStrings({ payload })

    expect(payload.findGlobal).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }))
  })

  it('never throws — a failed read yields English rather than blocking the send', async () => {
    const payload = stubPayload(undefined, { reject: true })

    const strings = await resolveEmailStrings({ payload })

    expect(strings).toEqual(EMAIL_STRING_DEFAULTS)
    expect(payload.logger.debug).toHaveBeenCalled()
  })

  it('collapses concurrent resolutions in one request to a single read', async () => {
    const payload = stubPayload({ when_label: 'Quand' })
    const req = { context: {} } as never

    const [a, b, c] = await Promise.all([
      resolveEmailStrings({ payload, locale: 'fr', req }),
      resolveEmailStrings({ payload, locale: 'fr', req }),
      resolveEmailStrings({ payload, locale: 'fr', req }),
    ])

    // Memoizing the in-flight promise (not the resolved value) is what keeps
    // concurrent callers from each issuing their own findGlobal.
    expect(payload.findGlobal).toHaveBeenCalledTimes(1)
    expect(a.when_label).toBe('Quand')
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })

  it('caches per locale, not per request', async () => {
    const payload = stubPayload({})
    const req = { context: {} } as never

    await resolveEmailStrings({ payload, locale: 'fr', req })
    await resolveEmailStrings({ payload, locale: 'de', req })

    expect(payload.findGlobal).toHaveBeenCalledTimes(2)
  })
})

describe('EMAIL_STRING_DEFAULTS ↔ translations schema', () => {
  // The defaults and the schema are two halves of one contract: the schema
  // decides what a translator can fill in, the defaults decide what
  // `withDefaults` will keep. A key in only one half is silently useless —
  // untranslatable, or translated but dropped on resolve.
  const emails = (
    atlasSchema as { properties: Record<string, { properties: Record<string, EmailKeySchema> }> }
  ).properties.emails.properties

  const schemaKeys = Object.entries(emails).flatMap(([key, prop]) =>
    prop.plural ? PLURAL_CATEGORIES.map((category) => `${key}_${category}`) : [key],
  )

  it('declares exactly the keys the defaults define', () => {
    expect(schemaKeys.slice().sort()).toEqual(Object.keys(EMAIL_STRING_DEFAULTS).sort())
  })
})
