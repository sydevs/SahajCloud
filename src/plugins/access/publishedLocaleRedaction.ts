/**
 * Keep a published-only API client from reading an unpublished locale's
 * content through `?locale=all` (#718).
 *
 * `createAccessConfig` restricts such a client to `{ _status: { equals:
 * 'published' } }`. On a collection with `versions.drafts.localizeStatus` that
 * clause is per locale, so a single-locale read is correctly gated: asking for
 * German when German is unpublished returns nothing.
 *
 * ⚠ **`locale=all` is not gated by it, and that is the hole this closes.** The
 * clause filters *documents* — it matches a document published in any locale —
 * while the response still carries every locale's value for every localized
 * field. Measured on this branch: a page published in English, published in
 * German, then unpublished in German, read by a published-only client at
 * `?locale=all`, returned `title: { en: 'Leak EN', de: 'Leck DE' }`. The German
 * text is the last thing that was published there, and the editor has since
 * taken it down.
 *
 * The narrowing is deliberately blunt: a cross-locale read by a published-only
 * client answers **which locales are published, and nothing else**. That is the
 * one cross-locale fact such a client is entitled to, and it is exactly the
 * documented contract (`?locale=all&select[_status]=true` — see
 * `docs/rules/api-clients.md`). Content stays available the ordinary way, one
 * locale at a time, where the access clause gates it properly.
 *
 * Redacting per field instead would mean walking each document against its
 * field tree — groups, named tabs, arrays, blocks — to find which values are
 * locale maps. That is a lot of machinery guarding a path no consumer needs,
 * and every gap in the walk is a leak. Keeping two keys cannot leak.
 */
import type { CollectionAfterReadHook, CollectionConfig } from 'payload'

import { hasValidPreviewSecret } from '@/lib/utilities/previewSecret'

/** True for a collection whose `_status` is stored per locale. */
export function hasLocalizedStatus(collection: CollectionConfig): boolean {
  const versions = collection.versions
  if (!versions || typeof versions !== 'object') return false
  const drafts = versions.drafts
  return !!drafts && typeof drafts === 'object' && drafts.localizeStatus === true
}

/**
 * The keys a cross-locale read keeps. `_status` is the contract; `id` is what
 * identifies the row it describes, and Payload returns it regardless of
 * `select` anyway.
 */
const CROSS_LOCALE_KEYS = new Set(['id', '_status'])

const redactCrossLocaleRead: CollectionAfterReadHook = ({ doc, req }) => {
  // Only a cross-locale read can carry another locale's value. A single-locale
  // read is already gated by the access clause.
  if (req.locale !== 'all') return doc
  // The same three conditions the published-only access branch uses, so the two
  // cannot disagree about who is restricted. A manager, the admin panel, and a
  // live-preview request all read drafts legitimately.
  if (req.user?.collection !== 'clients') return doc
  if (hasValidPreviewSecret(req)) return doc
  if (!doc || typeof doc !== 'object') return doc

  const source = doc as Record<string, unknown>
  const redacted: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    if (CROSS_LOCALE_KEYS.has(key)) redacted[key] = source[key]
  }
  return redacted
}

/**
 * Attach the redaction to any collection storing `_status` per locale.
 *
 * Keyed off the config rather than a slug list, so a third collection opting
 * into `localizeStatus` is covered the day it does — the same reason
 * `withLocalizedRoleAuth` introspects `roles` instead of naming `managers`.
 */
export function withPublishedLocaleRedaction(collection: CollectionConfig): CollectionConfig {
  if (!hasLocalizedStatus(collection)) return collection

  return {
    ...collection,
    hooks: {
      ...collection.hooks,
      afterRead: [...(collection.hooks?.afterRead ?? []), redactCrossLocaleRead],
    },
  }
}
