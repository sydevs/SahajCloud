import type { FieldHook, PayloadRequest } from 'payload'

import { getLocalTimeHHMM } from '@/lib/schedule/scheduleHooks'

/**
 * Which auto-title template an event gets, from its local start time.
 *
 * `default` covers a late-night start (22:00–04:59) and an event with no
 * schedule at all — an `inactive` listing, say — where naming a time of day
 * would be wrong rather than merely vague.
 */
export type EventTitleSlot = 'morning' | 'afternoon' | 'evening' | 'default'

/**
 * English source copy, and the last-resort fallback for any slot.
 *
 * Each slot is a **complete** template rather than a shared "Meditation at"
 * prefix plus a separate time-of-day word: a locale that puts the time of day
 * after the place, or inflects it with the preposition, can't be served by
 * concatenation. `%{place}` matches the interpolation convention used
 * throughout `translationsSchema.json`.
 */
export const EVENT_TITLE_DEFAULTS: Record<EventTitleSlot, string> = {
  morning: 'Morning Meditation at %{place}',
  afternoon: 'Afternoon Meditation at %{place}',
  evening: 'Evening Meditation at %{place}',
  default: 'Meditation at %{place}',
}

/** Where the in-flight `sy-atlas-translations` load is stashed on `req.context`. */
const CACHE_KEY = 'eventTitleTemplates'

/**
 * The venue/building or street name for an auto-title: the first comma-segment
 * of the street address (e.g. "Beethovenstraße 12, 2nd floor" → "Beethovenstraße 12").
 */
export function firstAddressSegment(street: unknown): string {
  if (typeof street !== 'string') return ''
  return street.split(',')[0]?.trim() ?? ''
}

/**
 * The place an auto-title names. The building's own name wins over its street —
 * "Evening Meditation at Broadstairs Friends Meeting House" tells a seeker far
 * more than "at 9 St Peter's Park Rd", and it's the name they'll see on the door.
 */
export function addressPlaceName(address: unknown): string {
  const { venueName, street } = (address ?? {}) as { venueName?: unknown; street?: unknown }
  if (typeof venueName === 'string' && venueName.trim()) return venueName.trim()
  return firstAddressSegment(street)
}

/**
 * Pick the time-of-day slot for a local `HH:MM` start time. A missing or
 * unparseable time falls to `default`.
 */
export function titleSlotForLocalTime(localTime: string | null | undefined): EventTitleSlot {
  const hour = Number(localTime?.slice(0, 2))
  if (!Number.isInteger(hour)) return 'default'
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'default'
}

/**
 * The slot for an event's `schedule` group. `firstDate` is stored in UTC with a
 * companion `firstDate_tz`, so the local wall-clock hour — the one a seeker
 * reads — has to be resolved through the timezone, not taken from the UTC
 * string. An event whose start is 19:00 in Auckland is 07:00 UTC: "evening",
 * not "morning".
 */
export function titleSlotForSchedule(schedule: unknown): EventTitleSlot {
  const { firstDate, firstDate_tz } = (schedule ?? {}) as {
    firstDate?: unknown
    firstDate_tz?: unknown
  }
  if (typeof firstDate !== 'string' || !firstDate) return 'default'
  const timeZone = typeof firstDate_tz === 'string' && firstDate_tz ? firstDate_tz : 'UTC'
  return titleSlotForLocalTime(getLocalTimeHHMM(firstDate, timeZone))
}

/**
 * Compose an event's auto-title by interpolating `%{place}` in `template`.
 * Returns null when there is no usable venue name or street, so the title stays
 * empty and `useAsTitle` falls back to the document id.
 */
export function composeEventTitle(template: string, address: unknown): string | null {
  const place = addressPlaceName(address)
  if (!place) return null
  const trimmed = template.trim()
  // A blank or placeholder-less template would otherwise silently drop the
  // place; fall back to the place alone rather than emitting a fixed string
  // that reads identically on every event.
  if (!trimmed || !trimmed.includes('%{place}')) return place
  return trimmed.replaceAll('%{place}', place).trim()
}

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
  // Nothing to name the place with → leave the title empty (useAsTitle falls
  // back to the document id).
  if (!addressPlaceName(address)) return value

  const templates = await resolveTitleTemplates(req)
  const slot = titleSlotForSchedule(data?.schedule ?? originalDoc?.schedule)
  // The guard above guarantees a usable place, so composeEventTitle returns a
  // non-null string here.
  return composeEventTitle(templates[slot], address)
}
