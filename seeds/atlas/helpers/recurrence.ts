/**
 * Parse the Atlas event `recurrence_data` Ruby-YAML blob into the structured
 * `schedule` shape that events.json carries (and `scheduleMapper` consumes).
 *
 * Extracted from extract.ts so it's unit-testable: extract.ts runs `main()` at
 * module load, so a test can't import from it. Pure + side-effect free, like the
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

/** The weekday an ISO `YYYY-MM-DD` date falls on, as a lowercase Atlas day name. */
export function weekdayOf(isoDate: string | null): string | null {
  if (!isoDate) return null
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return null
  // Construct in UTC so the local timezone can't shift the day.
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? null
}

/**
 * Parse the event `recurrence_data` Ruby-YAML into a structured schedule.
 * Returns null for inactive events with no real recurrence.
 *
 * Three dialects appear in the dump:
 *   1. old `:symbol:` keys with ISO dates and an explicit `:on:` weekday (411 rows)
 *   2. newer string keys with human dates and a quoted `'on':` weekday (33 rows)
 *   3. the same string keys with **no `on` key at all** (49 rows)
 *
 * In dialect 3 the recurring weekday is implied by `start_date`, so it's derived
 * from there. This matters most for `monthly_1st`: without a weekday,
 * `scheduleMapper` falls back to `monthlyMode: 'date'` and turns "first Sunday
 * of the month" into "the 3rd of every month" (2 events in the current dump).
 * Weekly events are covered either way — `scheduleMapper` has the same fallback
 * — but recording it here keeps events.json self-describing.
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
    weekNumber = 1 // only `monthly_1st` is present in the data
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
