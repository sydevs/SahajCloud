/**
 * Unit tests for the registrant-email translation resolver.
 *
 * Covers the two fallback layers separately, since they catch different
 * failures: Payload's own locale fallback (a wholly untranslated locale) and
 * the English key defaults (a partially translated locale, an unfilled key, or
 * an empty global).
 */
import type { Payload } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import {
  EMAIL_STRING_DEFAULTS,
  interpolate,
  resolveEmailStrings,
} from '@/lib/translations/emailStrings'

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
