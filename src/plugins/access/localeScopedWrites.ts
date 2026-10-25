/**
 * Locale-Scoped Writes (per-locale editors)
 *
 * A collection whose top-level `locale` column IS the document's own language
 * stores one language per document, while the role that writes it is granted
 * per locale and carries no language of its own. So a manager's write is
 * narrowed to the locale their role was read in — never the language the
 * document claims (#980, `docs/rules/access.md`).
 *
 * Two layers, because a create's language arrives at either of two moments.
 * `scopeLocaleWrite` answers `access[operation]`, which runs before the field
 * pass and so sees only a language the caller STATED. `restrictCreateToRequestLocale`
 * is the `beforeValidate` hook `accessPlugin` attaches to the same collections,
 * and is the complete rule: it runs after that pass, the first point a filled
 * value exists — which is what a `duplicate` has, since it sends empty `data`
 * and then clones the SOURCE document's locale.
 *
 * ⚠ **The column's meaning is declared at the field, never inferred from its
 * presence.** Two collections carry a queryable top-level `locale` and they do
 * not mean the same thing: `imports.locale` is the admin locale an upload
 * happened in (#912), so scoping it by the editor's locale would refuse a write
 * over a column that says nothing about who may write it. Presence as the rule
 * would scope it the day it takes an update grant. Only the collection owning
 * the column knows which it is, so each says so in `custom` via `localeColumn`,
 * and a column declaring nothing is scoped by nothing — `role-based-access.int.spec.ts`
 * walks the booted config and fails until it declares one.
 * `Lectures.subtitles[].locale` is a row key inside an array, which no
 * top-level rule reaches either way.
 */

import type { CollectionBeforeValidateHook, Field, FlattenedField, Where } from 'payload'

import { APIError } from 'payload'

import type { LocaleCode } from '@/lib/locales'

import { isAdminManager } from './adminOnly'

/** What a top-level `locale` column means. */
export type LocaleColumnMeaning = 'document-language' | 'unrelated'

/** A column that declares nothing. Scoped by nothing, and the int guard's target. */
export const UNDECLARED_LOCALE_COLUMN = 'undeclared'

const CUSTOM_KEY = 'localeColumn'

/**
 * `custom` for a top-level `locale` field, declaring what its column means.
 * `'document-language'` is the one value that scopes a collection's writes.
 */
export function localeColumn(meaning: LocaleColumnMeaning): Record<string, LocaleColumnMeaning> {
  return { [CUSTOM_KEY]: meaning }
}

type FieldList = readonly (Field | FlattenedField)[]

/**
 * What a field list's top-level `locale` column means, or `undefined` for a
 * list carrying none.
 *
 * Takes a collection's raw `fields` or its sanitized `flattenedFields`, so one
 * walk answers for the plugin and for a request alike. It descends only the
 * containers that add no path of their own — a row, a collapsible, an unnamed
 * tab or group — which is exactly the set sanitization splices into the top
 * level. A `locale` inside a named group, an array or a block is a nested path,
 * so it is not this column.
 */
export function localeColumnMeaning(
  fields: FieldList,
): LocaleColumnMeaning | typeof UNDECLARED_LOCALE_COLUMN | undefined {
  for (const field of fields) {
    if ('name' in field && field.name === 'locale') {
      const declared = ('custom' in field ? field.custom : undefined)?.[CUSTOM_KEY]
      return declared === 'document-language' || declared === 'unrelated'
        ? declared
        : UNDECLARED_LOCALE_COLUMN
    }

    // Payload's `flattenAllFields` splices a container carrying no name of its
    // own straight into the top level — a row, a collapsible, an unnamed group.
    // Descend exactly those, or the raw reader and the flattened one disagree.
    if ('fields' in field && !('name' in field)) {
      const nested = localeColumnMeaning(field.fields)
      if (nested) return nested
    }

    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab) continue
        const nested = localeColumnMeaning(tab.fields)
        if (nested) return nested
      }
    }
  }

  return undefined
}

// Memoized on the field array, as `getDocManagerFields` is: the answer is fixed
// for the life of a config, and a write access decision asks on every request.
// A WeakMap rather than a slug-keyed Map keeps a spec's throwaway config
// isolated from the booted one.
const verdictCache = new WeakMap<FieldList, boolean>()

/** True when the collection's writes are scoped to the role's locale. */
export function isLocaleScopedCollection(fields: FieldList): boolean {
  const cached = verdictCache.get(fields)
  if (cached !== undefined) return cached
  const verdict = localeColumnMeaning(fields) === 'document-language'
  verdictCache.set(fields, verdict)
  return verdict
}

/**
 * Narrow a granted write to one language.
 *
 * `create` answers with a boolean because `executeAccess` reads a `Where` as a
 * grant, so an object there would allow every language. An absent `locale` is
 * allowed: the field pass that fills it has not run yet, and the admin asks
 * this question with no data at all to decide whether to offer the Create
 * button. The hook below checks the filled value.
 */
export function scopeLocaleWrite(
  operation: 'create' | 'update' | 'delete',
  scope: LocaleCode | undefined,
  data: unknown,
): boolean | Where {
  if (!scope) return false

  if (operation === 'create') {
    const incoming = (data as { locale?: unknown } | null)?.locale
    return incoming == null || incoming === scope
  }

  return { locale: { equals: scope } }
}

/**
 * Refuse a non-admin manager's create whose resolved `locale` is not the one
 * they are editing in. Attached by `accessPlugin` to every collection whose
 * `locale` column declares `'document-language'`, so no collection wires it by
 * hand.
 */
export const restrictCreateToRequestLocale: CollectionBeforeValidateHook = ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data
  if (req.user?.collection !== 'managers' || isAdminManager(req.user)) return data

  const locale = data?.locale
  if (typeof locale === 'string' && locale !== req.locale) {
    throw new APIError('You can only create documents in the language you are editing in.', 403)
  }

  return data
}
