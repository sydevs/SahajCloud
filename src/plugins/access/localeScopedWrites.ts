/**
 * Locale-Scoped Writes (per-locale editors)
 *
 * A collection carrying a top-level `locale` column stores one language per
 * document, while the role that writes it is granted per locale and carries no
 * language of its own. So a manager's write is narrowed to the locale their
 * role was read in — never the language the document claims (#980,
 * `docs/rules/access.md`).
 *
 * ⚠ **A top-level field named `locale` IS the document's own language.** That
 * is an invariant this repo keeps, not a guess the code makes: a column
 * meaning anything else takes a name of its own — `Clients.language` for a
 * service's preferred language, `imports.uploadLocale` for the admin locale an
 * upload happened in (#912). `role-based-access.int.spec.ts` names every
 * collection carrying one and reds the suite when another appears, so a new
 * column cannot take this scope silently. `Lectures.subtitles[].locale` is a
 * row key inside an array, which no top-level rule reaches either way.
 *
 * Two layers, because a create's language arrives at either of two moments.
 * `scopeLocaleWrite` answers `access[operation]`, which runs before the field
 * pass and so sees only a language the caller STATED.
 * `restrictCreateToRequestLocale` is the `beforeValidate` hook `accessPlugin`
 * attaches to every collection, and is the complete rule: it runs after that
 * pass, the first point a filled value exists — which is what a `duplicate`
 * has, since it sends empty `data` and then clones the SOURCE document's
 * locale.
 */

import type { CollectionBeforeValidateHook, FlattenedField, PayloadRequest, Where } from 'payload'

import { APIError } from 'payload'

import type { LocaleCode } from '@/lib/locales'

import { isAdminManager } from './adminOnly'

type FieldList = readonly FlattenedField[]

/**
 * True when the collection's writes are scoped to the role's locale.
 *
 * ⚠ **Takes `flattenedFields`, and only ever that.** Sanitization splices
 * every container that adds no path of its own — a row, a collapsible, an
 * unnamed tab or group — straight into the top level, so a walk over the raw
 * `fields` has to reproduce that rule to agree with a query. Reproducing it
 * once missed an unnamed group, which scoped the column at the access layer
 * while leaving the collection without the create hook: the `duplicate`
 * bypass, reopened.
 */
export function isLocaleScopedCollection(fields: FieldList): boolean {
  return fields.some((field) => 'name' in field && field.name === 'locale')
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
 * Whether `documentLocale` is outside the language this request may write.
 *
 * `scopeLocaleWrite` answers with a `Where`, which only Payload's own
 * operations combine. Two writes carry none, so each compares the language
 * itself: the create hook below, which runs past the layer a `Where` reaches,
 * and `POST /api/meditations/:id/transcribe`, which proves `meditations: update`
 * and then reads with `overrideAccess` — so the grant this module narrows
 * everywhere else would stay collection-wide at that one door.
 */
export function isOutsideWritableLocale(req: PayloadRequest, documentLocale: unknown): boolean {
  if (req.user?.collection !== 'managers' || isAdminManager(req.user)) return false
  return typeof documentLocale === 'string' && documentLocale !== req.locale
}

/**
 * Refuse a non-admin manager's create whose resolved `locale` is not the one
 * they are editing in. Attached by `accessPlugin` to every collection, and
 * answers for the ones carrying a top-level `locale` — a verdict it reads off
 * the same `flattenedFields` a write decision does.
 */
export const restrictCreateToRequestLocale: CollectionBeforeValidateHook = ({
  collection,
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data
  if (!isLocaleScopedCollection(collection.flattenedFields)) return data

  if (isOutsideWritableLocale(req, data?.locale)) {
    throw new APIError('You can only create documents in the language you are editing in.', 403)
  }

  return data
}
