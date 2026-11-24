/**
 * Turns each CSV row into the draft class the job then creates.
 *
 * Per row: the column checks, a geocode the row's own postcode or town agrees
 * with (`locate.ts`), the zone at the point, the city region under the target,
 * the schedule, Payload's own field validation, the duplicate check — then the
 * cities no row's town had yet (`cities.ts`), the managers, and
 * `eventCreateData`. A row that fails any step is recorded on the run as
 * skipped.
 *
 * ⚠ **Nothing is written until every row is checked.** A city region is
 * created, and a manager account opened, only for a row that will become a
 * class — and `planRows` alone writes nothing at all, which is what a dry run
 * against production reads.
 */

import type { UploadedRow } from './csv/upload'
import type { ImportRow, ImportRun, SkippedRow } from './run'
import type { PayloadRequest } from 'payload'

import { Temporal } from '@js-temporal/polyfill'
import pMap from 'p-map'

import { classKey, findDuplicateClass } from '@/collections/Events/hooks/refuseDuplicateClass'
import type { GeocodedLocation } from '@/lib/mapbox/geocoder'
import { isManualMapboxId } from '@/lib/mapbox/manualLocation'
import type { Event } from '@/payload-types'

import { createCities, type PendingCity, planCity } from './cities'
import { GEOCODE_CONCURRENCY } from './constants'
import { checkRowFields } from './csv/fieldChecks'
import { eventCreateData } from './eventData'
import { locateRow } from './locate'
import { ensureManagers, managerKeyOf, managerRoster } from './managers'
import { importWriteContext } from './run'
import { timezoneAt } from './timezone'
import { fieldErrors } from './validate'

type Row = ImportRow

type Located =
  | { row: Row; ok: true; location: GeocodedLocation; timezone: string }
  | { row: Row; ok: false; errors: string[] }

/**
 * A row that passed every check but its manager. `regionId` is null while its
 * city is still `pending` — one the run is to create.
 */
export interface Planned {
  row: Row
  regionId: null | number
  pending?: PendingCity
  location: GeocodedLocation
  timezone: string
}

/** Every row that passed, in file order, with the class to create from it. */
export async function prepareRows(
  req: PayloadRequest,
  run: ImportRun,
  uploaded: readonly UploadedRow[],
): Promise<{ row: Row; data: Record<string, unknown> }[]> {
  const planned = await planRows(req, run, uploaded)

  const created = await createCities(req, run, pendingCities(planned))
  const ready = new Map<number, Planned>()
  for (const entry of planned) {
    const pending = entry.pending
    if (!pending) {
      ready.set(entry.row.row, entry)
      continue
    }
    const outcome = created.get(pending.placeId)
    if (typeof outcome === 'number') ready.set(entry.row.row, { ...entry, regionId: outcome })
    else skip(run, entry.row, [outcome ?? `the city region "${pending.name}" was not created`])
  }

  const managers = await ensureManagers(
    req,
    managerRoster([...ready.values()].map(({ row }) => ({ line: row.row, values: row.values }))),
  )

  return planned.flatMap(({ row }) => {
    const entry = ready.get(row.row)
    if (!entry) return []
    const email = managerKeyOf(row.values)
    const failure = email ? managers.failures.get(email) : undefined
    if (failure) return skip(run, row, [failure]) ?? []
    const built = build(run, entry, email ? (managers.ids.get(email) ?? null) : null)
    if (!built.ok) return skip(run, row, built.errors) ?? []
    return [{ row, data: built.data }]
  })
}

/** Check and place every row, writing nothing: the rows that would import, in file order. */
export async function planRows(
  req: PayloadRequest,
  run: ImportRun,
  uploaded: readonly UploadedRow[],
): Promise<Planned[]> {
  const rows: Row[] = uploaded.map(({ line, values }) => ({ row: line, values }))
  const located = await pMap(rows, (row) => locate(run, row), {
    concurrency: GEOCODE_CONCURRENCY,
  })
  const planned: Planned[] = []
  for (const entry of located) {
    if (!entry.ok) {
      skip(run, entry.row, entry.errors)
      continue
    }
    const placed = await placeRow(req, run, entry)
    if (placed) planned.push(placed)
  }
  return planned
}

/** The cities `planned` waits on, each with the lines that named it. */
function pendingCities(planned: readonly Planned[]) {
  const byPlace = new Map<string, { city: PendingCity; rows: number[] }>()
  for (const { pending, row } of planned) {
    if (!pending) continue
    const entry = byPlace.get(pending.placeId)
    if (entry) entry.rows.push(row.row)
    else byPlace.set(pending.placeId, { city: pending, rows: [row.row] })
  }
  return byPlace
}

/**
 * The region a row is filed under (or the city it needs created), its
 * schedule, and whether it repeats a class already listed or an earlier row of
 * this file. Null when skipped.
 */
async function placeRow(
  req: PayloadRequest,
  run: ImportRun,
  entry: Extract<Located, { ok: true }>,
): Promise<null | Planned> {
  const { row, location } = entry
  const town = location.placeName ?? row.values.city ?? ''

  // A city target takes only rows in that city; any other town is a mistake.
  if (
    run.target.level === 'city' &&
    !isManualMapboxId(run.target.mapboxId) &&
    location.placeId &&
    location.placeId !== run.target.mapboxId
  ) {
    return skip(run, row, [`"${town}" is not in ${run.target.name}`]) ?? null
  }

  const regionId =
    (location.placeId ? run.cities.get(location.placeId) : undefined) ??
    (run.target.level === 'city' ? run.target.id : undefined)
  let pending: PendingCity | undefined
  if (regionId === undefined) {
    const plan = planCity(run, location, town)
    if (!plan.ok) {
      return (
        skip(run, row, [plan.reason], plan.missingCity ? { missingCity: { name: town } } : {}) ??
        null
      )
    }
    pending = plan.city
  }

  const planned: Planned = { ...entry, regionId: regionId ?? null, pending }
  const built = build(run, planned, null)
  if (!built.ok) return skip(run, row, built.errors) ?? null
  // A city still to be created has no id to check yet; its create is that check.
  const refused = await fieldErrors(
    req,
    built.data,
    importWriteContext(),
    pending ? ['region'] : [],
  )
  if (refused.length) return skip(run, row, refused) ?? null

  const identity = classKey(built.data as Partial<Event>)
  const key = `${regionId ?? `new:${pending?.placeId}`}|${identity}`
  const earlier = run.claimed.get(key)
  if (earlier !== undefined) {
    return (
      skip(run, row, [`repeats row ${earlier} of this file`], { duplicateOf: { row: earlier } }) ??
      null
    )
  }
  // A city the run has yet to create lists no class to repeat.
  const twin =
    regionId === undefined ? null : await findDuplicateClass(req, built.data as Partial<Event>)
  if (twin) {
    return (
      skip(run, row, [`repeats the class "${twin.title}" already listed`], {
        duplicateOf: { eventId: twin.id, title: twin.title },
      }) ?? null
    )
  }
  if (identity) run.claimed.set(key, row.row)
  return planned
}

function build(run: ImportRun, entry: Planned, managerId: null | number) {
  return eventCreateData({
    values: entry.row.values,
    location: entry.location,
    timezone: entry.timezone as never,
    today: Temporal.Now.plainDateISO(entry.timezone),
    regionId: entry.regionId,
    managerId,
    importBatch: run.importId,
    defaultLanguages: run.defaultLanguages,
  })
}

async function locate(run: ImportRun, row: Row): Promise<Located> {
  const errors = checkRowFields(row.values)
  if (errors.length) return { row, ok: false, errors }

  const placed = await locateRow({ values: row.values, towns: run.towns })
  if (!placed.ok) return { row, ok: false, errors: [placed.error] }

  const zone = timezoneAt(placed.location.latitude, placed.location.longitude)
  if (!zone.ok) return { row, ok: false, errors: [zone.error] }
  return { row, ok: true, location: placed.location, timezone: zone.timezone }
}

function skip(
  run: ImportRun,
  row: Row,
  reasons: string[],
  extra: Pick<SkippedRow, 'duplicateOf' | 'missingCity'> = {},
): undefined {
  run.skipped.push({ row: row.row, reasons, values: row.values, ...extra })
  return undefined
}
