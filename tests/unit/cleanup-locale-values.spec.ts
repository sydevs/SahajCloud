/**
 * `localeValues` splits the `{ [locale]: value }` shape a `locale: 'all'` read
 * returns. CleanupOrphanedMedia reads every locale, so getting this wrong in
 * either direction loses a reference and trashes a file that is in use (#977).
 */
import { describe, expect, it } from 'vitest'

import { localeValues } from '@/jobs/CleanupOrphanedMedia/schemaUtils'

const LOCALES = ['en', 'fr', 'pt-BR'] as const

describe('localeValues', () => {
  it('splits a locale map into one value per locale', () => {
    expect(localeValues({ en: [{ media: 1 }], fr: [{ media: 2 }] }, LOCALES)).toEqual([
      [{ media: 1 }],
      [{ media: 2 }],
    ])
  })

  it('leaves a group whose keys are not all locale codes alone', () => {
    const group = { en: 'a', caption: 'b' }
    expect(localeValues(group, LOCALES)).toEqual([group])
  })

  it('never splits when the caller read a single locale', () => {
    const map = { en: 1, fr: 2 }
    expect(localeValues(map, [])).toEqual([map])
  })

  it('leaves an array, a scalar and an empty object alone', () => {
    expect(localeValues([{ media: 1 }], LOCALES)).toEqual([[{ media: 1 }]])
    expect(localeValues(7, LOCALES)).toEqual([7])
    expect(localeValues({}, LOCALES)).toEqual([{}])
  })
})
