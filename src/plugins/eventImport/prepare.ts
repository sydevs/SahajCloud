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
 * created, and a manager account opened, only for a row that passed every
 * check, so a row the checks refuse leaves no empty city behind. A class whose
 * create is refused after that can, and the import page lists its city.
 */

import type { UploadedRow } from './csv/upload'
import type { Geocode } from './locate'
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
import { locateRow, memoiseGeocode } from './locate'
import { ensureManagers, managerKeyOf, managerRoster } from './managers'
import { importWriteContext } from './run'
import { timezoneAt } from './timezone'
import { fieldErrors } from './validate'

type Row = ImportRow

type Located =
  | { row: Row; ok: true; location: GeocodedLocation; timezone: string }
  | { row: Row; ok: false; errors: string[] }

/** A row that passed every check but its manager, filed under a city it has or one to create. */
type Planned = { row: Row; location: GeocodedLocation; timezone: string } & (
  { regionId: number; pending?: undefined } | { regionId: null; pending: PendingCity }
)

/** Every row that passed, in file order, with the class to create from it. */
export async function prepareRows(
  req: PayloadRequest,
  run: ImportRun,
  uploaded: readonly UploadedRow[],
): Promise<{ row: Row; data: Record<string, unknown> }[]> {
  const planned = await planRows(req, run, uploaded)
  const cityIds = await createCities(req, run, planned)
  const ready = planned.flatMap((entry): Planned[] => {
    if (!entry.pending) return [entry]
    const regionId = cityIds.get(entry.pending.placeId)
    return regionId === undefined ? [] : [{ ...entry, regionId, pending: undefined }]
  })

  const managers = await ensureManagers(
    req,
    managerRoster(ready.map(({ row }) => ({ line: row.row, values: row.values }))),
  )

  return ready.flatMap((entry) => {
    const { row } = entry
    const email = managerKeyOf(row.values)
    const failure = email ? managers.failures.get(email) : undefined
    if (failure) return skip(run, row, [failure]) ?? []
    const built = build(run, entry, email ? (managers.ids.get(email) ?? null) : null)
    if (!built.ok) return skip(run, row, built.errors) ?? []
    return [{ row, data: built.data }]
  })
}

/** Check and place every row, writing nothing: the rows that would import, in file order. */
async function planRows(
  req: PayloadRequest,
  run: ImportRun,
  uploaded: readonly UploadedRow[],
): Promise<Planned[]> {
  const geocode = memoiseGeocode()
  const rows: Row[] = uploaded.map(({ line, values }) => ({ row: line, values }))
  const located = await pMap(rows, (row) => locate(row, geocode), {
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
    return skip(run, row, [`"${town}" is not in ${run.target.name}`])
  }

  const regionId =
    (location.placeId ? run.cities.get(location.placeId) : undefined) ??
    (run.target.level === 'city' ? run.target.id : undefined)
  let planned: Planned
  if (regionId !== undefined) planned = { ...entry, regionId }
  else {
    const pending = planCity(run, location)
    if (!pending) {
      return skip(
        run,
        row,
        [`no city region for "${town}" under ${run.target.name} — create it first`],
        {
          missingCity: { name: town },
        },
      )
    }
    planned = { ...entry, regionId: null, pending }
  }

  const built = build(run, planned, null)
  if (!built.ok) return skip(run, row, built.errors)
  // A city still to be created has no id to check yet; its create is that check.
  const ignore = planned.pending ? ['region'] : []
  const refused = await fieldErrors(req, built.data, importWriteContext(), ignore)
  if (refused.length) return skip(run, row, refused)

  const identity = classKey(built.data as Partial<Event>)
  const key = `${planned.pending ? `new:${planned.pending.placeId}` : planned.regionId}|${identity}`
  const earlier = run.claimed.get(key)
  if (earlier !== undefined) {
    return skip(run, row, [`repeats row ${earlier} of this file`], {
      duplicateOf: { row: earlier },
    })
  }
  // With no region yet — a city to create — this lists no class and asks nothing.
  const twin = await findDuplicateClass(req, built.data as Partial<Event>)
  if (twin) {
    return skip(run, row, [`repeats the class "${twin.title}" already listed`], {
      duplicateOf: { eventId: twin.id, title: twin.title },
    })
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

async function locate(row: Row, geocode: Geocode): Promise<Located> {
  const errors = checkRowFields(row.values)
  if (errors.length) return { row, ok: false, errors }

  const placed = await locateRow(row.values, geocode)
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
): null {
  run.skipped.push({ row: row.row, reasons, values: row.values, ...extra })
  return null
}
