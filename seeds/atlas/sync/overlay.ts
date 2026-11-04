/**
 * The grooming overlay: curated values kept apart from the mechanical
 * extraction, so a fresh dump can be re-curated without redoing the work.
 *
 * An entry records, for one row, the mechanical values it was groomed
 * against (`basis`) and the curated values that differ from them (`set`).
 * Applying the overlay to a newer extraction copies a curated value over only
 * while every field it was derived from is unchanged upstream — the
 * per-field port that #621 ran by hand, kept as code.
 *
 * Pure: no filesystem, no database. `cli.ts` does the I/O.
 */
import { isDeepStrictEqual } from 'node:util'

export type Row = { legacyId: number } & Record<string, unknown>

export interface OverlayEntry {
  /** The row's identity within its table (`keyOf`). */
  key: string
  legacyId: number
  /** Mechanical values of the watched and source fields at grooming time. */
  basis: Record<string, unknown>
  /** Curated values that differ from the mechanical extraction. */
  set: Record<string, unknown>
}

export interface OverlaySpec {
  /**
   * Fields a groomer judges. An upstream change to any of them sends the row
   * back for review, even when no curated value of it went stale.
   */
  watched: readonly string[]
  /** The mechanical fields a curated field was derived from. Defaults to itself. */
  dependsOn?: Readonly<Record<string, readonly string[]>>
  /**
   * Whether every row is a reviewed row. True for files a person grooms
   * (events, venues): a row without an entry is then new and owes a review.
   * False for files only patched by exception, where only patched rows get one.
   */
  reviewsEveryRow: boolean
  /** A row's identity. Defaults to `legacyId`; regions share one id space across levels. */
  key?: (row: Row) => string
}

export const keyOf = (spec: OverlaySpec, row: Row): string =>
  spec.key ? spec.key(row) : String(row.legacyId)

/** Never curated: carried from the fresh extraction on every build. */
const NEVER_CURATED = new Set(['legacyId', 'legacyData'])

const sourcesOf = (spec: OverlaySpec, field: string): readonly string[] =>
  spec.dependsOn?.[field] ?? [field]

const pick = (row: Row, fields: Iterable<string>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const field of fields) out[field] = row[field] ?? null
  return out
}

const same = (a: unknown, b: unknown): boolean => isDeepStrictEqual(a ?? null, b ?? null)

/**
 * Record an overlay from curated rows and the mechanical rows they were
 * groomed against. Curated rows with no mechanical twin (there should be
 * none) are returned as `orphans` rather than silently dropped.
 */
export function recordOverlay(
  curated: readonly Row[],
  mechanical: readonly Row[],
  spec: OverlaySpec,
): { entries: OverlayEntry[]; orphans: string[] } {
  const byKey = new Map(mechanical.map((row) => [keyOf(spec, row), row]))
  const entries: OverlayEntry[] = []
  const orphans: string[] = []

  for (const row of curated) {
    const key = keyOf(spec, row)
    const base = byKey.get(key)
    if (!base) {
      orphans.push(key)
      continue
    }
    const set: Record<string, unknown> = {}
    for (const field of new Set([...Object.keys(row), ...Object.keys(base)])) {
      if (NEVER_CURATED.has(field)) continue
      if (!same(row[field], base[field])) set[field] = row[field] ?? null
    }
    if (!spec.reviewsEveryRow && Object.keys(set).length === 0) continue
    const basisFields = new Set(spec.watched)
    for (const field of Object.keys(set))
      for (const src of sourcesOf(spec, field)) basisFields.add(src)
    entries.push({ key, legacyId: row.legacyId, basis: pick(base, basisFields), set })
  }

  entries.sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }))
  return { entries, orphans }
}

export type RowStatus =
  /** No entry: never reviewed. */
  | 'new'
  /** Entry, and nothing it watches moved upstream. Every curated value applied. */
  | 'unchanged'
  /** Entry, but a watched or source field moved upstream. Owes a fresh review. */
  | 'changed'

export interface RowOutcome {
  key: string
  legacyId: number
  status: RowStatus
  /** Basis fields whose mechanical value moved upstream. */
  changedFields: string[]
  /** Curated fields not applied because a source field moved. */
  staleFields: string[]
}

export interface ApplyResult {
  rows: Row[]
  outcomes: RowOutcome[]
  /** Keys of entries whose row is gone from the extraction — deleted upstream. */
  deletedUpstream: string[]
}

/** Lay an overlay over a fresh mechanical extraction. */
export function applyOverlay(
  mechanical: readonly Row[],
  entries: readonly OverlayEntry[],
  spec: OverlaySpec,
): ApplyResult {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]))
  const present = new Set<string>()
  const rows: Row[] = []
  const outcomes: RowOutcome[] = []

  for (const base of mechanical) {
    const key = keyOf(spec, base)
    present.add(key)
    const entry = byKey.get(key)
    if (!entry) {
      rows.push(base)
      if (spec.reviewsEveryRow) {
        outcomes.push({
          key,
          legacyId: base.legacyId,
          status: 'new',
          changedFields: [],
          staleFields: [],
        })
      }
      continue
    }

    const changedFields = Object.keys(entry.basis).filter(
      (field) => !same(entry.basis[field], base[field]),
    )
    const moved = new Set(changedFields)
    const staleFields: string[] = []
    const row: Row = { ...base }
    for (const [field, value] of Object.entries(entry.set)) {
      if (sourcesOf(spec, field).some((src) => moved.has(src))) staleFields.push(field)
      else row[field] = value
    }
    rows.push(row)
    // Only watched fields decide a re-review; a moved source field always
    // shows up as a stale curated value, which decides it on its own.
    const needsReview =
      staleFields.length > 0 || changedFields.some((f) => spec.watched.includes(f))
    outcomes.push({
      key,
      legacyId: base.legacyId,
      status: needsReview ? 'changed' : 'unchanged',
      changedFields,
      staleFields,
    })
  }

  const deletedUpstream = entries.map((e) => e.key).filter((key) => !present.has(key))
  return { rows, outcomes, deletedUpstream }
}

/**
 * What each file's overlay watches. Events and venues are groomed row by row;
 * the rest are patched only by exception, so only a patched row has an entry.
 */
export const OVERLAY_SPECS: Record<string, OverlaySpec> = {
  events: {
    reviewsEveryRow: true,
    watched: [
      'eventType',
      'category',
      'customName',
      'room',
      'description',
      'languageCode',
      'onlineUrl',
      'registrationUrl',
      'contactInfo',
      'venueId',
      'areaId',
      'schedule',
    ],
    dependsOn: {
      // A title is judged against the venue the auto-fill would name instead.
      customName: ['customName', 'venueId'],
      // Lifted out of free text and the unread contact_info keys (seeds/atlas/AGENTS.md).
      website: ['description', 'contactInfo', 'onlineUrl', 'registrationUrl'],
      contactEmail: ['description', 'contactInfo'],
      languageCodes: ['languageCode', 'customName', 'description'],
    },
  },
  venues: {
    reviewsEveryRow: true,
    watched: ['name', 'street', 'city', 'postCode', 'countryCode', 'latitude', 'longitude'],
  },
  regions: { reviewsEveryRow: false, watched: [], key: (row) => `${row.level}:${row.legacyId}` },
  managers: { reviewsEveryRow: false, watched: [] },
  clients: { reviewsEveryRow: false, watched: [] },
  users: { reviewsEveryRow: false, watched: [] },
  registrations: { reviewsEveryRow: false, watched: [] },
  pictures: { reviewsEveryRow: false, watched: [] },
}
