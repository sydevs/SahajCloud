import { getLocalTimeHHMM } from '@/lib/schedule/scheduleHooks'

/**
 * Which auto-title template an event gets, from its local start time.
 *
 * `default` covers a late-night start (22:00–04:59) and an event with no
 * schedule at all — an `inactive` listing, say — where naming a time of day
 * would be wrong rather than merely vague.
 */
export type EventTitleSlot = 'morning' | 'afternoon' | 'evening' | 'default'

/** Every slot, in a stable order — for iterating the template set. */
export const EVENT_TITLE_SLOTS = ['morning', 'afternoon', 'evening', 'default'] as const

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
