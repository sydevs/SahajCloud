/**
 * Per-locale manager roles — normalizing, collapsing and ranking
 *
 * These are the pure halves of #665. The impure half (the `locale: 'all'` read
 * that produces the record) is covered by `tests/int/role-based-access.int.spec.ts`,
 * which authenticates for real — a mock cannot show that the read happens, and
 * mocks are precisely what hid this bug for as long as they did.
 */

import { describe, it, expect } from 'vitest'

import {
  normalizeLocalizedRoles,
  rankLocalesByRoleCount,
  unionRoles,
} from '../../src/plugins/access/localizedRoles'

describe('normalizeLocalizedRoles', () => {
  it('keeps only locales that carry at least one role', () => {
    expect(
      normalizeLocalizedRoles({
        en: ['web-translator'],
        fr: [],
        de: null,
        cs: ['path-editor', 'meditations-editor'],
      }),
    ).toEqual({
      en: ['web-translator'],
      cs: ['path-editor', 'meditations-editor'],
    })
  })

  it('drops keys that are not real locales', () => {
    // A stray key would otherwise become a locale nobody can select, and would
    // count towards the ranking that decides where a manager lands.
    expect(normalizeLocalizedRoles({ en: ['web-translator'], klingon: ['path-editor'] })).toEqual({
      en: ['web-translator'],
    })
  })

  it('returns an empty record for a flat array', () => {
    // This is the shape a manager arrives with when the `locale: 'all'` read did
    // NOT happen — the bug itself. Reading it as "no roles" denies rather than
    // granting the default locale's roles everywhere.
    expect(normalizeLocalizedRoles(['web-translator', 'path-editor'])).toEqual({})
  })

  it('returns an empty record for absent or non-object values', () => {
    expect(normalizeLocalizedRoles(undefined)).toEqual({})
    expect(normalizeLocalizedRoles(null)).toEqual({})
    expect(normalizeLocalizedRoles('web-translator')).toEqual({})
  })
})

describe('unionRoles', () => {
  it('collects roles across every locale, de-duplicated', () => {
    expect(
      unionRoles({
        en: ['web-translator'],
        fr: ['web-translator', 'path-editor'],
        cs: ['meditations-editor'],
      }).sort(),
    ).toEqual(['meditations-editor', 'path-editor', 'web-translator'])
  })

  it('is empty for a manager with no roles anywhere', () => {
    expect(unionRoles({})).toEqual([])
  })
})

describe('rankLocalesByRoleCount', () => {
  it('orders by role count, most first', () => {
    expect(
      rankLocalesByRoleCount({
        en: ['web-translator'],
        fr: ['web-translator', 'path-editor', 'meditations-editor'],
        cs: ['path-editor', 'meditations-editor'],
      }),
    ).toEqual(['fr', 'cs', 'en'])
  })

  it('breaks an equal count on LOCALES order', () => {
    // Supplied in an order that contradicts both LOCALES and the answer, so a
    // spec passing by accident of insertion order is not possible.
    expect(
      rankLocalesByRoleCount({
        nl: ['web-translator'],
        de: ['path-editor'],
        en: ['meditations-editor'],
      }),
    ).toEqual(['en', 'de', 'nl'])
  })

  it('is empty for a manager with no role locales', () => {
    expect(rankLocalesByRoleCount({})).toEqual([])
  })
})
