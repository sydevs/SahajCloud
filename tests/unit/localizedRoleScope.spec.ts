/**
 * Which locale's roles a permission check evaluates (#665)
 *
 * `Managers.roles` is localized, so every check has to say which locale it means.
 * These specs pin the three answers — a locale, `'union'`, and nothing — against
 * the two callers that get them wrong in opposite directions:
 *
 * - a collection check scoped to the WRONG locale would grant a manager's English
 *   roles in all 19 locales. This is the over-grant half of the bug.
 * - the admin nav check has no locale to offer at all, and scoping it to none
 *   empties the sidebar for every non-admin manager.
 *
 * The nav case is here because removing `locale: 'union'` from `createHidden`
 * broke nothing in the suite when this was written — the guard was real and
 * entirely uncovered.
 */

import { describe, it, expect } from 'vitest'

import { hasPermission } from '../../src/plugins/access'
import { createHidden } from '../../src/plugins/access/visibility'
import { testData } from '../utils/testData'

/** A manager holding `web-translator` in French and nothing in English. */
const frenchOnlyManager = testData.dummyUser('managers', {
  id: 1,
  type: 'manager',
  roles: { fr: ['web-translator'] },
})

describe('per-locale role scoping', () => {
  it('grants in the locale the role was assigned in', () => {
    expect(
      hasPermission({
        user: frenchOnlyManager,
        collection: 'pages',
        operation: 'update',
        locale: 'fr',
        field: { localized: true },
      }),
    ).toBe(true)
  })

  it('denies in a locale the manager holds no role in', () => {
    // The over-grant half of #665: this used to be TRUE for every locale,
    // because roles resolved at the default locale whatever the request said.
    expect(
      hasPermission({
        user: frenchOnlyManager,
        collection: 'pages',
        operation: 'update',
        locale: 'de',
        field: { localized: true },
      }),
    ).toBe(false)
  })

  it('denies when no locale is given', () => {
    // `?locale=all` reaches `hasPermission` with no locale. A request for every
    // locale at once names none, so it grants nothing rather than falling back
    // to the default locale's roles.
    expect(
      hasPermission({
        user: frenchOnlyManager,
        collection: 'pages',
        operation: 'update',
        field: { localized: true },
      }),
    ).toBe(false)
  })

  it('grants under `union` regardless of which locale holds the role', () => {
    expect(
      hasPermission({
        user: frenchOnlyManager,
        collection: 'pages',
        operation: 'update',
        locale: 'union',
        field: { localized: true },
      }),
    ).toBe(true)
  })

  it('leaves API clients — whose roles are a flat array — unaffected', () => {
    // `Clients.roles` is deliberately not localized, so no scope applies to it.
    const client = testData.dummyUser('clients', {
      id: 2,
      roles: ['wemeditate-web-client'],
      _status: 'published',
    })

    for (const locale of ['fr', 'de', 'union', undefined] as const) {
      expect(
        hasPermission({ user: client, collection: 'pages', operation: 'read', locale }),
      ).toBe(true)
    }
  })
})

describe('admin nav visibility', () => {
  it('shows a collection to a manager whose role is in a non-active locale', () => {
    // Payload calls `hidden({ user })` with NO locale, and `getVisibleEntities`
    // treats a throw as hidden. Without the union scope every collection and
    // global disappears from the sidebar for every non-admin manager — they
    // would land in an admin with no navigation at all.
    const hidden = createHidden('pages')

    expect(hidden({ user: frenchOnlyManager })).toBe(false)
  })

  it('still hides a collection the manager has no role for anywhere', () => {
    const hidden = createHidden('managers')

    expect(hidden({ user: frenchOnlyManager })).toBe(true)
  })

  it('hides everything from an unauthenticated visitor', () => {
    expect(createHidden('pages')({ user: null })).toBe(true)
  })
})
