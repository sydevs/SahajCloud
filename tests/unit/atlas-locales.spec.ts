import { describe, expect, it } from 'vitest'

import { normalizeLanguages } from '@/endpoints/atlas/seo/atlasLocales'
import { ATLAS_DEFAULT_LOCALES } from '@/lib/atlas/defaultLocales'

/**
 * Reading the atlas's enabled languages off the `sy-atlas-config` global.
 *
 * Everything here is a state the **API cannot produce**, which is why it is
 * tested at this level rather than through `updateGlobal`: the field is
 * `required` with `minRows: 1`, so Payload rejects an empty save outright
 * (verified — the integration spec's attempt to write `[]` raises
 * `ValidationError: The following field is invalid: Languages`). These are the
 * shapes that arrive from *stored data* instead — a column that predates the
 * field, or one holding a locale since removed from the CMS.
 */
describe('normalizeLanguages', () => {
  it('reads the codes out of the stored rows, in order', () => {
    expect(normalizeLanguages([{ code: 'fr' }, { code: 'nl' }, { code: 'de' }])).toEqual([
      'fr',
      'nl',
      'de',
    ])
  })

  // The case that matters on deploy day: production's global row already exists
  // (it has held the map centre for a while) and a field `defaultValue` does not
  // backfill it. Falling back to the launch set is what keeps every atlas page's
  // hreflang cluster intact until an operator chooses otherwise.
  it.each([
    ['an empty array — the column predates the field', []],
    ['a missing value', undefined],
    ['null', null],
    ['a non-array', 'fr'],
  ])('falls back to the launch set for %s', (_label, stored) => {
    expect(normalizeLanguages(stored)).toEqual([...ATLAS_DEFAULT_LOCALES])
  })

  it('drops a code the CMS no longer has a locale for', () => {
    // Otherwise a locale deleted from `LOCALES` in code would survive in stored
    // data and be advertised as an alternate nothing can render.
    expect(normalizeLanguages([{ code: 'fr' }, { code: 'klingon' }, { code: 'nl' }])).toEqual([
      'fr',
      'nl',
    ])
  })

  it('drops duplicates — a repeated hreflang is invalid markup', () => {
    // Nothing stops an operator adding the same language twice.
    expect(normalizeLanguages([{ code: 'fr' }, { code: 'nl' }, { code: 'fr' }])).toEqual([
      'fr',
      'nl',
    ])
  })

  it('falls back rather than emitting nothing when every stored code is unusable', () => {
    // An empty hreflang set would silently de-list the page's alternates. The
    // launch set is the safer answer to data we cannot read.
    expect(normalizeLanguages([{ code: 'klingon' }])).toEqual([...ATLAS_DEFAULT_LOCALES])
  })

  it('tolerates malformed rows without throwing', () => {
    // This feeds a public read on somebody else's page render.
    expect(normalizeLanguages([null, { code: 'fr' }, {}, 42])).toEqual(['fr'])
  })
})
