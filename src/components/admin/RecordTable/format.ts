import { toWords } from 'payload/shared'

/**
 * Cell rendering modes for {@link RecordColumn}.
 * - `datetime` — render an ISO date string as `YYYY-MM-DD HH:mm UTC`.
 * - `name` — render an actor reference (`{ id, name }`) as its name.
 * - `text` (default) — stringify scalars; JSON-encode objects.
 */
export type ColumnFormat = 'datetime' | 'name' | 'text'

export interface RecordColumn {
  /** Property read from each record. */
  key: string
  /** Column header. */
  label: string
  /** How to render the cell (default `text`). */
  format?: ColumnFormat
}

/** One row of the table — an arbitrary json object. */
export type RecordRow = Record<string, unknown>

/** Render an ISO date/time as a stable, locale-independent `YYYY-MM-DD HH:mm UTC`. */
function formatDateTime(value: unknown): string {
  if (value == null || value === '') return ''
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  const iso = date.toISOString() // 2026-06-11T14:30:00.000Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/** Render an actor reference (`{ id, name }`) as its name, falling back to `#id`. */
function formatName(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.name === 'string' && obj.name) return obj.name
    if (obj.id != null) return `#${String(obj.id)}`
    return ''
  }
  return String(value)
}

/**
 * Format a single cell value for display. `datetime` and `name` get
 * purpose-built rendering; everything else stringifies (objects as JSON).
 */
export function formatCellValue(value: unknown, format?: ColumnFormat): string {
  switch (format) {
    case 'datetime':
      return formatDateTime(value)
    case 'name':
      return formatName(value)
    default:
      if (value == null) return ''
      if (typeof value === 'object') return JSON.stringify(value)
      return String(value)
  }
}

/**
 * Infer columns from the union of keys across all records (first-seen order),
 * deriving a Title-Case label from each key. Used when a field doesn't supply
 * `admin.custom.columns`.
 */
export function inferColumns(records: RecordRow[]): RecordColumn[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const record of records) {
    if (!record || typeof record !== 'object') continue
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }
  return keys.map((key) => ({ key, label: toWords(key) }))
}
