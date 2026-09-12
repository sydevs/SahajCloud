/**
 * `parseAvailableLocales` / `readAvailableLocales` — the pure half of the
 * `availableLocales` field (#705), replacing `atlas-locales.spec.ts` and the
 * `normalizeLanguages` it covered.
 *
 * The interesting cases are states the API cannot produce. The field is
 * `required` and always contains `en`, so an empty or malformed stored value
 * only ever means the column predates the field — which is exactly what
 * production looks like the moment this deploys, and is untestable through
 * `updateGlobal`.
 *
 * `unpublishedLocales` is here too: it is pure, and its two input shapes (a
 * per-locale map, and a plain string from a global without `localizeStatus`)
 * are cheaper to enumerate than to arrange in a database.
 */
import { describe, expect, it } from 'vitest'

import { unpublishedLocales } from '@/fields/availableLocalesField'
import { parseAvailableLocales, readAvailableLocales } from '@/lib/translations/availableLocales'

describe('parseAvailableLocales', () => {
  it('keeps valid codes in the order they were stored', () => {
    expect(parseAvailableLocales(['fr', 'nl', 'de'])).toEqual(['fr', 'nl', 'de'])
  })

  // Validated rather than trusted: a locale later removed from LOCALES in code
  // would otherwise survive in stored data and be published as an hreflang
  // alternate for a language the CMS can no longer render.
  it('drops a code that is no longer a CMS locale', () => {
    expect(parseAvailableLocales(['fr', 'klingon', 'nl'])).toEqual(['fr', 'nl'])
  })

  // A repeated hreflang is invalid markup, and nothing stops a stored duplicate.
  it('de-duplicates, keeping the first occurrence', () => {
    expect(parseAvailableLocales(['fr', 'nl', 'fr'])).toEqual(['fr', 'nl'])
  })

  it('ignores non-string entries rather than throwing', () => {
    expect(parseAvailableLocales([null, 'fr', { code: 'nl' }, 42])).toEqual(['fr'])
  })

  it('returns an empty list for anything that is not an array', () => {
    for (const stored of [undefined, null, 'fr', 42, {}]) {
      expect(parseAvailableLocales(stored)).toEqual([])
    }
  })

  it('returns an empty list when nothing in the array is usable', () => {
    expect(parseAvailableLocales(['klingon'])).toEqual([])
  })
})

describe('readAvailableLocales', () => {
  it('passes a configured list through unchanged', () => {
    expect(readAvailableLocales(['en', 'fr'])).toEqual(['en', 'fr'])
  })

  // The behaviour change #705 makes deliberately. The deleted
  // ATLAS_DEFAULT_LOCALES answered an unconfigured column with the ten launch
  // languages; that told a crawler nine languages had pages before an operator
  // said any of them were translated.
  it('answers English alone for an unconfigured column, not a launch set', () => {
    expect(readAvailableLocales(undefined)).toEqual(['en'])
    expect(readAvailableLocales([])).toEqual(['en'])
    expect(readAvailableLocales(['klingon'])).toEqual(['en'])
  })
})

describe('unpublishedLocales', () => {
  it('names the locales whose per-locale status is not published', () => {
    const status = { en: 'published', fr: 'draft', nl: 'published' }
    expect(unpublishedLocales(status, ['en', 'fr', 'nl'])).toEqual(['fr'])
  })

  it('treats a locale absent from the map as unpublished', () => {
    expect(unpublishedLocales({ en: 'published' }, ['en', 'de'])).toEqual(['de'])
  })

  it('returns nothing when every selected locale is published', () => {
    expect(unpublishedLocales({ en: 'published', fr: 'published' }, ['en', 'fr'])).toEqual([])
  })

  // A global without `localizeStatus` stores one status for everything, so the
  // answer is all-or-nothing. Since #709 every translations global sets the
  // flag, so this branch has no caller — it is what lets the field mount on a
  // new surface before that global opts in.
  it('reads a plain string status as all-or-nothing', () => {
    expect(unpublishedLocales('published', ['en', 'fr'])).toEqual([])
    expect(unpublishedLocales('draft', ['en', 'fr'])).toEqual(['en', 'fr'])
  })

  // A global that has never been written returns no `_status` at all. Failing
  // closed is the safe direction: nothing is published until something says so.
  it('treats a missing status as nothing published', () => {
    expect(unpublishedLocales(undefined, ['en'])).toEqual(['en'])
    expect(unpublishedLocales(null, ['en', 'fr'])).toEqual(['en', 'fr'])
  })
})
