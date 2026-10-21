/**
 * Locale-Scoped Writes (per-locale editors)
 *
 * A collection named here stores ONE language per document, in a top-level
 * `locale` column, while the role that writes it is granted per locale and
 * carries no language of its own. So a manager's write is narrowed to the
 * locale their role was read in — never the language the document claims
 * (#980, `docs/rules/access.md`).
 *
 * Two layers, because a create's language arrives at either of two moments.
 * `scopeLocaleWrite` answers `access[operation]`, which runs before the field
 * pass and so sees only a language the caller STATED. `restrictCreateToRequestLocale`
 * is the `beforeValidate` hook `accessPlugin` attaches to the same collections,
 * and is the complete rule: it runs after that pass, the first point a filled
 * value exists — which is what a `duplicate` has, since it sends empty `data`
 * and then clones the SOURCE document's locale.
 *
 * ⚠ **Keyed on an explicit slug set, never on "has a field named `locale`".**
 * Four collections carry one and no two mean the same thing: the document's
 * own language here, a service's preferred language (`Clients.locale`), a row
 * key inside an array (`Lectures.subtitles[].locale`), and the admin locale an
 * upload happened in (`imports.locale`, #912). A field-name rule would answer
 * every `lectures` write — a role holds `update` there — with a 400, since
 * `lectures` has no queryable top-level `locale` path. Same reasoning as
 * `REGION_SUBTREE_COLLECTIONS`: a security-sensitive narrowing is audited at a
 * glance, and a stray field must not silently opt a collection in.
 */

import type { ContentSlug } from './types'
import type { CollectionBeforeValidateHook, Where } from 'payload'

import { APIError } from 'payload'

import type { LocaleCode } from '@/lib/locales'

import { isAdminManager } from './adminOnly'

/** Collections whose `locale` column IS the document's language. */
const LOCALE_SCOPED_COLLECTIONS = new Set<ContentSlug>(['meditations'])

/** True when the collection's writes are scoped to the role's locale. */
export function isLocaleScopedCollection(collection: ContentSlug): boolean {
  return LOCALE_SCOPED_COLLECTIONS.has(collection)
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
 * they are editing in. Attached by `accessPlugin` to every collection
 * `isLocaleScopedCollection` names, so no collection wires it by hand.
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
