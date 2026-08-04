import type { FieldHook, PayloadRequest } from 'payload'

import type { EventTitleSlot } from '@/lib/eventTitle/compose'

import {
  addressPlaceName,
  composeEventTitle,
  EVENT_TITLE_DEFAULTS,
  titleSlotForSchedule,
} from '@/lib/eventTitle/compose'

/** Where the in-flight `sy-atlas-translations` load is stashed on `req.context`. */
const CACHE_KEY = 'eventTitleTemplates'

/**
 * Load the localized auto-title templates from the Sahaj Atlas translations
 * global at most once per request, shared across many events being saved (e.g.
 * during bulk imports or ExpireEvents job runs). Each slot falls back to its
 * English default independently, so a partially translated locale still yields
 * a complete set.
 *
 * Why memoize the in-flight *promise* rather than the resolved value: bulk
 * operations can issue many `beforeChange` hooks concurrently. A resolved-value
 * cache stampedes under that concurrency — all N hooks clear the "not cached
 * yet" check before the first load settles, so each issues its own `findGlobal`.
 * Storing the promise synchronously (no await between the check and the store)
 * means every later caller awaits the same one, collapsing the load to exactly
 * one. A failed load is evicted so a later read in the same request can retry.
 */
async function resolveTitleTemplates(req: PayloadRequest): Promise<Record<EventTitleSlot, string>> {
  const ctx = (req.context ?? {}) as Record<string, unknown>
  let templatesPromise = ctx[CACHE_KEY] as Promise<Record<EventTitleSlot, string>> | undefined
  if (!templatesPromise) {
    templatesPromise = (async () => {
      try {
        const translations = await req.payload.findGlobal({
          slug: 'sy-atlas-translations',
          locale: req.locale,
          depth: 0,
          req,
        })
        const stored = (translations as { event?: { title?: Record<string, unknown> } }).event
          ?.title
        const resolved = { ...EVENT_TITLE_DEFAULTS }
        for (const slot of Object.keys(EVENT_TITLE_DEFAULTS) as EventTitleSlot[]) {
          const value = stored?.[slot]
          if (typeof value === 'string' && value.trim()) resolved[slot] = value
        }
        return resolved
      } catch (error) {
        req.payload.logger.debug({
          msg: 'Failed to read sy-atlas-translations event.title; using defaults',
          error,
        })
        return { ...EVENT_TITLE_DEFAULTS }
      }
    })()
    ctx[CACHE_KEY] = templatesPromise
    req.context = ctx
    // Evict on failure so a transient error doesn't poison the rest of the
    // request (restores the un-memoized retry behaviour). Callers already
    // awaiting this in-flight promise still reject together — the load did fail.
    void templatesPromise.catch(() => {
      if (ctx[CACHE_KEY] === templatesPromise) delete ctx[CACHE_KEY]
    })
  }
  return templatesPromise
}

/**
 * beforeChange hook for the Events `title` field. An explicit title (newly
 * entered, or carried over on a partial update) is kept as-is; an empty title
 * is auto-filled from the event's venue (or street) and the time of day it
 * starts — "Evening Meditation at Broadstairs Friends Meeting House". `title` is
 * localized, so this computes per save-locale; clearing the field re-triggers
 * the auto-fill.
 */
export const eventTitleBeforeChange: FieldHook = async ({ value, data, originalDoc, req }) => {
  const incoming = typeof value === 'string' ? value : undefined
  const existing = typeof originalDoc?.title === 'string' ? originalDoc.title : undefined
  // `incoming ?? existing` keeps an existing title on a partial update (value
  // undefined) but lets an explicit clear (value '') fall through to auto-fill.
  const current = incoming ?? existing
  if (current && current.trim()) return current

  const address = data?.address ?? originalDoc?.address
  // Nothing to name the place with → hand the value back untouched and let the
  // field's own `required` validation reject it. Field `beforeChange` hooks run
  // *before* validation (payload/dist/fields/hooks/beforeChange/promise.js), so
  // an event with neither a title nor an address is refused rather than saved
  // blank. Online events have no address at all, which is why the Atlas importer
  // supplies its own fallback title for them rather than relying on this hook.
  if (!addressPlaceName(address)) return value

  const templates = await resolveTitleTemplates(req)
  const slot = titleSlotForSchedule(data?.schedule ?? originalDoc?.schedule)
  // The guard above guarantees a usable place, so composeEventTitle returns a
  // non-null string here.
  return composeEventTitle(templates[slot], address)
}
