import type { CollectionBeforeValidateHook, PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  isLocaleScopedCollection,
  localeColumn,
  localeColumnMeaning,
  restrictCreateToRequestLocale,
  scopeLocaleWrite,
} from '@/plugins/access/localeScopedWrites'

/**
 * A collection's `locale` column says what it means, and the write scoping
 * reads that declaration rather than the column's presence (#980). The cases
 * below pin the walk: which containers it descends, and that a column
 * declaring nothing scopes nothing.
 *
 * What forces a NEW collection to declare one is
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

const localeField = (meaning?: 'document-language' | 'unrelated') => ({
  name: 'locale',
  type: 'select' as const,
  options: ['en', 'fr'],
  ...(meaning && { custom: localeColumn(meaning) }),
})

describe('localeColumnMeaning', () => {
  it('reads the declaration off a top-level locale field', () => {
    expect(localeColumnMeaning([localeField('document-language')])).toBe('document-language')
    expect(localeColumnMeaning([localeField('unrelated')])).toBe('unrelated')
  })

  it('answers undeclared for a column that declares nothing', () => {
    expect(localeColumnMeaning([localeField()])).toBe('undeclared')
  })

  it('answers undefined for a field list carrying no locale column', () => {
    expect(localeColumnMeaning([{ name: 'label', type: 'text' }])).toBeUndefined()
  })

  it('descends the containers that add no path of their own', () => {
    expect(
      localeColumnMeaning([{ type: 'group', fields: [localeField('document-language')] }]),
    ).toBe('document-language')
    expect(localeColumnMeaning([{ type: 'row', fields: [localeField('document-language')] }])).toBe(
      'document-language',
    )
    expect(
      localeColumnMeaning([
        { type: 'tabs', tabs: [{ label: 'Details', fields: [localeField('document-language')] }] },
      ]),
    ).toBe('document-language')
  })

  it('ignores a locale nested under a path of its own', () => {
    expect(
      localeColumnMeaning([
        { name: 'subtitles', type: 'array', fields: [localeField('document-language')] },
      ]),
    ).toBeUndefined()
    expect(
      localeColumnMeaning([
        { name: 'meta', type: 'group', fields: [localeField('document-language')] },
      ]),
    ).toBeUndefined()
    expect(
      localeColumnMeaning([
        { type: 'tabs', tabs: [{ name: 'meta', fields: [localeField('document-language')] }] },
      ]),
    ).toBeUndefined()
  })
})

describe('isLocaleScopedCollection', () => {
  it('scopes a column declared the document language', () => {
    expect(isLocaleScopedCollection([localeField('document-language')])).toBe(true)
  })

  it('fails closed on anything else', () => {
    expect(isLocaleScopedCollection([localeField('unrelated')])).toBe(false)
    expect(isLocaleScopedCollection([localeField()])).toBe(false)
    expect(isLocaleScopedCollection([{ name: 'language', type: 'text' }])).toBe(false)
  })
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
