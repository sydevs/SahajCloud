/**
 * Turns each CSV row into the draft class the plugin then creates.
 *
 * Per row: the column checks, a geocode, the zone at the point, the city
 * region under the target, the schedule, Payload's own field validation, the
 * duplicate check, the manager — and `eventCreateData`. A row that fails any step is recorded on the run as
 * skipped and handed back as `undefined`, which the plugin's batch loop steps
 * over without counting. The file was cleaned at upload (`csv/upload.ts`), so
 * every row here is a real one and carries its spreadsheet line.
 *
 * ⚠ **Only a miss or a refusal is about the row.** The geocoder being down or
 * unconfigured throws, which fails the whole import with that sentence; a row
 * error there would send the volunteer fixing addresses that are fine.
 */

import type { RawImportRow } from '../csv/columns'
import type { ImportRun, SkippedRow } from '../run'
import type { ImportBeforeHook } from '@payloadcms/plugin-import-export/types'
import type { PayloadRequest } from 'payload'

import { Temporal } from '@js-temporal/polyfill'
import pMap from 'p-map'
import { APIError } from 'payload'

import { classKey, findDuplicateClass } from '@/collections/Events/hooks/refuseDuplicateClass'
import type { GeocodedLocation, GeocodeLocationArgs } from '@/lib/mapbox/geocoder'
import { geocodeLocation } from '@/lib/mapbox/geocoder'
import { isManualMapboxId } from '@/lib/mapbox/manualLocation'
import type { Event } from '@/payload-types'

import { GEOCODE_CONCURRENCY } from '../constants'
import { checkRowFields } from '../csv/fieldChecks'
import { eventCreateData } from '../eventData'
import { ensureManagers, managerKeyOf, managerRoster } from '../managers'
import { lineOf, normaliseRow } from '../rows'
import { runOf } from '../run'
import { timezoneAt } from '../timezone'
import { fieldErrors } from '../validate'

interface Row {
  row: number
  values: RawImportRow
}

type Prepared =
  | { row: Row; ok: true; location: GeocodedLocation; timezone: string }
  | { row: Row; ok: false; errors: string[] }

/** A row that passed every check but its manager, with what it will be created from. */
interface Ready {
  row: Row
  regionId: number
  location: GeocodedLocation
  timezone: string
}

export const beforeImport: ImportBeforeHook = async ({ originalData, req }) => {
  const run = runOf(req)
  const rows: Row[] = originalData.map((raw) => ({ row: lineOf(raw), values: normaliseRow(raw) }))
  const prepared = await pMap(rows, prepareRow, { concurrency: GEOCODE_CONCURRENCY })

  // Everything but the manager is settled first, so an account is opened only
  // for a row that will become a class.
  const ready = new Map<number, Ready>()
  for (const entry of prepared) {
    if (!entry.ok) {
      skip(run, entry.row, entry.errors)
      continue
    }
    const placed = await placeRow(req, run, entry)
    if (placed) ready.set(entry.row.row, placed)
  }

  const managers = await ensureManagers(
    req,
    managerRoster([...ready.values()].map(({ row }) => ({ line: row.row, values: row.values }))),
  )

  return rows.map((row) => {
    const entry = ready.get(row.row)
    if (!entry) return undefined
    const email = managerKeyOf(row.values)
    const failure = email ? managers.failures.get(email) : undefined
    if (failure) return skip(run, row, [failure])
    const built = build(run, entry, email ? (managers.ids.get(email) ?? null) : null)
    if (!built.ok) return skip(run, row, built.errors)
    run.submitted.push({ row: row.row, values: row.values })
    return built.data
  }) as never
}

/**
 * The region a row is filed under, its schedule, and whether it repeats a
 * class already listed or an earlier row of this file. Null when skipped.
 */
async function placeRow(
  req: PayloadRequest,
  run: ImportRun,
  entry: Extract<Prepared, { ok: true }>,
): Promise<null | Ready> {
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
  if (regionId === undefined) {
    return (
      skip(run, row, [`no city region for "${town}" under ${run.target.name} — create it first`], {
        missingCity: { name: town },
      }) ?? null
    )
  }

  const ready: Ready = { ...entry, regionId }
  const built = build(run, ready, null)
  if (!built.ok) return skip(run, row, built.errors) ?? null
  const refused = await fieldErrors(req, built.data)
  if (refused.length) return skip(run, row, refused) ?? null

  const key = `${regionId}|${classKey(built.data as Partial<Event>)}`
  const earlier = run.claimed.get(key)
  if (earlier !== undefined) {
    return (
      skip(run, row, [`repeats row ${earlier} of this file`], { duplicateOf: { row: earlier } }) ??
      null
    )
  }
  const twin = await findDuplicateClass(req, built.data as Partial<Event>)
  if (twin) {
    return (
      skip(run, row, [`repeats the class "${twin.title}" already listed`], {
        duplicateOf: { eventId: twin.id, title: twin.title },
      }) ?? null
    )
  }
  if (classKey(built.data as Partial<Event>)) run.claimed.set(key, row.row)
  return ready
}

function build(run: ImportRun, entry: Ready, managerId: null | number) {
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

async function prepareRow(row: Row): Promise<Prepared> {
  const errors = checkRowFields(row.values)
  if (errors.length) return { row, ok: false, errors }

  const outcome = await geocodeLocation(geocodeQuery(row.values))
  switch (outcome.status) {
    case 'unconfigured':
      throw new APIError('Address lookup is not configured on this server. Ask an admin.', 500)
    case 'unavailable':
      throw new APIError('The address lookup service did not answer. Try again later.', 503)
    case 'refused':
      return {
        row,
        ok: false,
        errors: [
          `Mapbox could not look up this location (HTTP ${outcome.httpStatus}) — simplify the address and city`,
        ],
      }
    case 'missed':
      return {
        row,
        ok: false,
        errors: ['the address could not be found — check the address, city and country'],
      }
    case 'found':
      break
  }

  const zone = timezoneAt(outcome.location.latitude, outcome.location.longitude)
  if (!zone.ok) return { row, ok: false, errors: [zone.error] }
  return { row, ok: true, location: outcome.location, timezone: zone.timezone }
}

/**
 * Field by field, never one line: joined into one string, a state and a
 * postcode trailing the town were enough for Mapbox to pick the same street in
 * another town. An online class is placed by its town alone.
 */
function geocodeQuery(values: RawImportRow): GeocodeLocationArgs {
  const common = {
    city: values.city ?? '',
    region: values.state,
    countryCode: values.country ?? '',
  }
  if (values.eventType === 'online') return { kind: 'place', ...common }
  return { kind: 'address', address: values.address, postcode: values.postcode, ...common }
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
