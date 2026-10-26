import type { CollectionBeforeValidateHook, FlattenedField, PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  isLocaleScopedCollection,
  isOutsideWritableLocale,
  localeColumn,
  localeColumnMeaning,
  restrictCreateToRequestLocale,
  scopeLocaleWrite,
} from '@/plugins/access/localeScopedWrites'

/**
 * A collection's `locale` column says what it means, and the write scoping
 * reads that declaration rather than the column's presence (#980).
 *
 * ⚠ **Every list below is a `flattenedFields` list**, which is the only shape
 * the walk takes. Sanitization is what splices a row, a collapsible or an
 * unnamed group into the top level, so the cases that used to pin a descent
 * through one now belong to Payload — and the fields a reader would expect
 * descended are exactly the ones that reach the top level without one.
 *
 * What forces a NEW collection to declare a meaning is
 * `role-based-access.int.spec.ts`, which needs the booted config to see the
 * column at all.
 */

type HookArgs = Parameters<CollectionBeforeValidateHook>[0]

const callHook = (args: {
  data?: Record<string, unknown>
  fields?: FlattenedField[]
  operation?: 'create' | 'update'
  user?: Record<string, unknown> | null
  locale?: string
}) =>
  restrictCreateToRequestLocale({
    collection: { flattenedFields: args.fields ?? [localeField('document-language')] },
    data: args.data ?? {},
    operation: args.operation ?? 'create',
    req: { user: args.user ?? null, locale: args.locale ?? 'fr' } as PayloadRequest,
  } as HookArgs)

const frEditor = { collection: 'managers', type: 'manager' }

const request = (user: Record<string, unknown> | null, locale = 'fr') =>
  ({ user, locale }) as PayloadRequest

const localeField = (meaning?: 'document-language' | 'unrelated') =>
  ({
    name: 'locale',
    type: 'select',
    options: ['en', 'fr'],
    ...(meaning && { custom: localeColumn(meaning) }),
  }) as unknown as FlattenedField

const named = (name: string, type: string, fields: FlattenedField[] = []) =>
  ({ name, type, flattenedFields: fields }) as unknown as FlattenedField

describe('localeColumnMeaning', () => {
  it('reads the declaration off a top-level locale field', () => {
    expect(localeColumnMeaning([localeField('document-language')])).toBe('document-language')
    expect(localeColumnMeaning([localeField('unrelated')])).toBe('unrelated')
  })

  it('answers undeclared for a column that declares nothing', () => {
    expect(localeColumnMeaning([localeField()])).toBe('undeclared')
  })

  it('answers undefined for a field list carrying no locale column', () => {
    expect(localeColumnMeaning([named('label', 'text')])).toBeUndefined()
  })

  it('descends nothing: a container at this level owns a path, so its locale is not this column', () => {
    expect(
      localeColumnMeaning([named('subtitles', 'array', [localeField('document-language')])]),
    ).toBeUndefined()
    expect(
      localeColumnMeaning([named('meta', 'group', [localeField('document-language')])]),
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
    expect(isLocaleScopedCollection([named('language', 'text')])).toBe(false)
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

/**
 * The comparison the two `Where`-less writes share — the create hook, and the
 * transcribe endpoint, which reads with `overrideAccess` after its permission
 * gate.
 */
describe('isOutsideWritableLocale', () => {
  it('refuses a language that is not the one being edited in', () => {
    expect(isOutsideWritableLocale(request(frEditor), 'en')).toBe(true)
    expect(isOutsideWritableLocale(request(frEditor), 'fr')).toBe(false)
  })

  it('binds nobody but a non-admin manager', () => {
    expect(isOutsideWritableLocale(request({ collection: 'managers', type: 'admin' }), 'en')).toBe(
      false,
    )
    expect(isOutsideWritableLocale(request({ collection: 'clients' }), 'en')).toBe(false)
    expect(isOutsideWritableLocale(request(null), 'en')).toBe(false)
  })

  // A document whose language is unreadable is not a document in another
  // language, and the layers that own the refusal still run.
  it('refuses nothing over an absent language', () => {
    expect(isOutsideWritableLocale(request(frEditor), undefined)).toBe(false)
    expect(isOutsideWritableLocale(request(frEditor), null)).toBe(false)
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

  // It is attached to every collection, so standing down is its own case:
  // without it, an upload's admin locale would scope who may create the row.
  it('stands down on a collection whose locale column is not the document language', () => {
    expect(() =>
      callHook({ data: { locale: 'en' }, fields: [localeField('unrelated')], user: frEditor }),
    ).not.toThrow()
    expect(() =>
      callHook({ data: { locale: 'en' }, fields: [localeField()], user: frEditor }),
    ).not.toThrow()
    expect(() => callHook({ data: { locale: 'en' }, fields: [], user: frEditor })).not.toThrow()
  })
})
