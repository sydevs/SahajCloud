/**
 * Parse the Atlas event `recurrence_data` Ruby-YAML blob into the structured
 * `schedule` shape that events.json carries (and `scheduleMapper` consumes).
 *
 * Extracted from extract.ts so it is unit-testable: extract.ts runs `main()` at
 * module load, so a test cannot import from it. Pure + side-effect free, like the
 * rest of seeds/atlas/helpers.
 */

/** The parsed schedule shape written to events.json. */
export interface ParsedSchedule {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  weekNumber: number | null
  weekday: string | null
  startDate: string | null
  startTime: string | null
  endDate: string | null
  endTime: string | null
}

/** Normalize a recurrence date ("2023-07-26" or "August 19, 2023") to ISO YYYY-MM-DD. */
export function normalizeDate(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, '')
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  // Use local components — `trimmed` is a date-only value, avoid TZ day-shift.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function normalizeTime(raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim().replace(/^['"]|['"]$/g, '')
  return /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : null
}

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

/**
 * Atlas `monthly_*` recurrence types map to schedule `weekNumber` (`-1`
 * means last). The dump holds `monthly_1st`, `monthly_2nd`, and
 * `monthly_last`. 3rd and 4th are covered for completeness. Matches
 * `scheduleMapper`'s WEEK_NUMBERS domain.
 */
const MONTHLY_WEEK_NUMBERS: Record<string, number> = {
  monthly_1st: 1,
  monthly_2nd: 2,
  monthly_3rd: 3,
  monthly_4th: 4,
  monthly_last: -1,
}

/** The weekday an ISO `YYYY-MM-DD` date falls on, as a lowercase Atlas day name. */
export function weekdayOf(isoDate: string | null): string | null {
  if (!isoDate) return null
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return null
  // Construct in UTC so the local timezone cannot shift the day.
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? null
}

/**
 * Parse the event `recurrence_data` Ruby-YAML into a structured schedule.
 * Returns null for inactive events with no real recurrence.
 *
 * Three dialects have appeared across dumps:
 *   1. old `:symbol:` keys with ISO dates and an explicit `:on:` weekday
 *      (2024 dump only — the 2026-08 dump re-serialized every row)
 *   2. string keys with human dates and a quoted `'on':` weekday (394 rows)
 *   3. the same string keys with **no `on` key at all** (263 rows)
 *
 * In dialect 3 the recurring weekday is implied by `start_date`, so it is derived
 * from there. This matters most for monthly types: without a weekday,
 * `scheduleMapper` falls back to `monthlyMode: 'date'` and turns "first Sunday
 * of the month" into "the 3rd of every month". Weekly events are covered either
 * way — `scheduleMapper` has the same fallback — but recording it here keeps
 * events.json self-describing. The derivation can also be *wrong* when a
 * manager entered the creation date rather than a first occurrence — seven
 * events carry a hand-curated `schedule.weekday` in events.json where their own
 * title or description names a different day (see seeds/atlas/AGENTS.md).
 */
export function parseSchedule(raw: unknown): ParsedSchedule | null {
  const text = typeof raw === 'string' ? raw : null
  if (!text) return null
  const get = (key: string): string | null => {
    // Match `:key: value` or `key: value` or `'key': value`.
    const m = text.match(new RegExp(`(?:^|\\n)\\s*:?'?${key}'?:\\s*([^\\n]*)`))
    return m
      ? m[1]
          .trim()
          .replace(/^:/, '')
          .replace(/^['"]|['"]$/g, '')
      : null
  }
  const type = get('type')
  if (!type) return null

  let frequency: ParsedSchedule['frequency']
  let interval = 1
  let weekNumber: number | null = null
  if (type.startsWith('daily')) frequency = 'daily'
  else if (type.startsWith('weekly')) {
    frequency = 'weekly'
    const m = type.match(/weekly_(\d+)/)
    if (m) interval = parseInt(m[1], 10)
  } else if (type.startsWith('monthly')) {
    frequency = 'monthly'
    weekNumber = MONTHLY_WEEK_NUMBERS[type] ?? 1
  } else return null

  const startDate = normalizeDate(get('start_date'))
  // Daily events genuinely have no weekday, so they keep null.
  const weekday = get('on') || (frequency === 'daily' ? null : weekdayOf(startDate))
  return {
    frequency,
    interval,
    weekNumber,
    weekday: weekday || null,
    startDate,
    startTime: normalizeTime(get('start_time')),
    endDate: normalizeDate(get('end_date')),
    endTime: normalizeTime(get('end_time')),
  }
}
