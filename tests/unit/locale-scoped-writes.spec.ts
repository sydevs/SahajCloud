import type { CollectionBeforeValidateHook, PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  isLocaleScopedCollection,
  restrictCreateToRequestLocale,
  scopeLocaleWrite,
} from '@/plugins/access/localeScopedWrites'

/**
 * The set of locale-scoped collections is named, never derived from "has a
 * field called `locale`" (#980). Three collections carry one and no two mean
 * the same thing, so the cases below pin the two that must stay out: `imports`
 * stores the admin locale an upload happened in (#912), and `lectures` a row
 * key inside `subtitles`. `clients` was a third until its column was renamed
 * to `language` — it is not a localized collection, so there is no longer a
 * verdict to pin.
 *
 * These pin the verdicts. What forces a NEW collection to get one is
 * `role-based-access.int.spec.ts`, which needs the booted config to see the
 * column at all.
 */

type HookArgs = Parameters<CollectionBeforeValidateHook>[0]

const callHook = (args: {
  data?: Record<string, unknown>
  operation?: 'create' | 'update'
  user?: Record<string, unknown> | null
  locale?: string
}) =>
  restrictCreateToRequestLocale({
    data: args.data ?? {},
    operation: args.operation ?? 'create',
    req: { user: args.user ?? null, locale: args.locale ?? 'fr' } as PayloadRequest,
  } as HookArgs)

const frEditor = { collection: 'managers', type: 'manager' }

describe('isLocaleScopedCollection', () => {
  it('names meditations', () => {
    expect(isLocaleScopedCollection('meditations')).toBe(true)
  })

  it.each(['lectures', 'imports'] as const)(
    'leaves %s out, whose locale field means something else',
    (collection) => {
      expect(isLocaleScopedCollection(collection)).toBe(false)
    },
  )
})

describe('scopeLocaleWrite', () => {
  it('denies every operation when no locale resolved', () => {
    expect(scopeLocaleWrite('update', undefined, {})).toBe(false)
    expect(scopeLocaleWrite('create', undefined, { locale: 'fr' })).toBe(false)
  })

  it('scopes update and delete to the role locale', () => {
    expect(scopeLocaleWrite('update', 'fr', {})).toEqual({ locale: { equals: 'fr' } })
    expect(scopeLocaleWrite('delete', 'fr', {})).toEqual({ locale: { equals: 'fr' } })
  })

  it('answers create with a boolean, since a Where there would grant every language', () => {
    expect(scopeLocaleWrite('create', 'fr', { locale: 'fr' })).toBe(true)
    expect(scopeLocaleWrite('create', 'fr', { locale: 'en' })).toBe(false)
  })

  it('allows a create that states no locale, so the Create button survives', () => {
    expect(scopeLocaleWrite('create', 'fr', {})).toBe(true)
    expect(scopeLocaleWrite('create', 'fr', null)).toBe(true)
  })
})

describe('restrictCreateToRequestLocale', () => {
  it('refuses a filled locale that is not the one being edited in', () => {
    expect(() => callHook({ data: { locale: 'en' }, user: frEditor })).toThrow(
      /only create documents in the language/,
    )
  })

  it('passes the editor own language', () => {
    expect(callHook({ data: { locale: 'fr' }, user: frEditor })).toEqual({ locale: 'fr' })
  })

  it('leaves an update alone — only a create resolves a language here', () => {
    expect(() =>
      callHook({ data: { locale: 'en' }, operation: 'update', user: frEditor }),
    ).not.toThrow()
  })

  it('leaves an admin and a non-manager alone', () => {
    const admin = { collection: 'managers', type: 'admin' }
    expect(() => callHook({ data: { locale: 'en' }, user: admin })).not.toThrow()
    expect(() =>
      callHook({ data: { locale: 'en' }, user: { collection: 'clients' } }),
    ).not.toThrow()
  })
})
