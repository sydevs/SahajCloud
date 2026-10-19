/**
 * Turns each CSV row into the draft class the plugin then creates.
 *
 * Per row: the column checks, a geocode, the zone at the point, the schedule,
 * the city region under the target, the manager — and `eventCreateData`.
 * A row that fails any step is recorded on the run as skipped and handed back
 * as `undefined`, which the plugin's batch loop steps over without counting,
 * so its own row numbers stay aligned with the file.
 *
 * ⚠ **Only a miss or a refusal is about the row.** The geocoder being down or
 * unconfigured throws, which fails the whole import with that sentence; a row
 * error there would send the volunteer fixing addresses that are fine.
 */

import type { RawImportRow } from '../csv/columns'
import type { ImportRun } from '../run'
import type { ImportBeforeHook } from '@payloadcms/plugin-import-export/types'

import { Temporal } from '@js-temporal/polyfill'
import pMap from 'p-map'
import { APIError } from 'payload'

import type { GeocodedLocation, GeocodeLocationArgs } from '@/lib/mapbox/geocoder'
import { geocodeLocation } from '@/lib/mapbox/geocoder'

import { GEOCODE_CONCURRENCY, IMPORT_BATCH_SIZE } from '../constants'
import { checkRowFields } from '../csv/fieldChecks'
import { isTemplateHelpRow } from '../csv/template'
import { eventCreateData } from '../eventData'
import { ensureManagers, managerKeyOf, managerRoster } from '../managers'
import { cityIndex } from '../regions'
import { checkHeader, normaliseRow } from '../rows'
import { runOf } from '../run'
import { timezoneAt } from '../timezone'

interface Row {
  row: number
  values: RawImportRow
}

type Prepared =
  | { row: Row; ok: true; location: GeocodedLocation; timezone: string }
  | { row: Row; ok: false; errors: string[] }

export const beforeImport: ImportBeforeHook = async ({
  batchNumber,
  originalData,
  req,
}) => {
  const run = runOf(req)
  if (batchNumber === 1) {
    const refusal = checkHeader(Object.keys(originalData[0] ?? {}))
    if (refusal) throw new APIError(refusal, 400, null, true)
  }

  const offset = (batchNumber - 1) * IMPORT_BATCH_SIZE
  const rows: (Row | null)[] = originalData.map((raw, index) => {
    const record = Object.values(raw).map((value) => (value == null ? '' : String(value)))
    if (isTemplateHelpRow(record)) return null
    return { row: offset + index + 1, values: normaliseRow(raw) }
  })

  const cities = await cityIndex(req, run.target.id)
  const prepared = await pMap(rows, (row) => (row ? prepareRow(row) : null), {
    concurrency: GEOCODE_CONCURRENCY,
  })

  const roster = managerRoster(
    prepared.flatMap((entry) =>
      entry?.ok ? [{ line: entry.row.row, values: entry.row.values }] : [],
    ),
  )
  const managers = await ensureManagers(req, roster)

  return prepared.map((entry) => {
    if (!entry) return undefined
    if (!entry.ok) return skip(run, entry.row, entry.errors)

    const { row, location, timezone } = entry
    const regionId = regionFor(location, run, cities)
    if (regionId === null) {
      return skip(run, row, [
        `no city region for "${location.placeName ?? row.values.city}" under ${run.target.name} — create it in Regions first`,
      ])
    }

    const email = managerKeyOf(row.values)
    const failure = email ? managers.failures.get(email) : undefined
    if (failure) return skip(run, row, [failure])
    const managerId = email ? (managers.ids.get(email) ?? null) : null

    const built = eventCreateData({
      values: row.values,
      location,
      timezone: timezone as never,
      today: Temporal.Now.plainDateISO(timezone),
      regionId,
      managerId,
      importBatch: run.importId,
      defaultLanguages: run.defaultLanguages,
    })
    if (!built.ok) return skip(run, row, built.errors)
    run.submitted.push({ row: row.row, values: row.values })
    return built.data
  }) as never
}

async function prepareRow(row: Row): Promise<Prepared> {
  const { errors } = checkRowFields(row.values)
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
        errors: [`Mapbox could not look up this location (HTTP ${outcome.httpStatus}) — simplify the address and city`],
      }
    case 'missed':
      return { row, ok: false, errors: ['the address could not be found — check the address, city and country'] }
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
  const common = { city: values.city ?? '', region: values.state, countryCode: values.country ?? '' }
  if (values.eventType === 'online') return { kind: 'place', ...common }
  return { kind: 'address', address: values.address, postcode: values.postcode, ...common }
}

/** The city under the target the row's town is, or the target itself when that is a city. */
function regionFor(
  location: GeocodedLocation,
  run: ImportRun,
  cities: ReadonlyMap<string, number>,
): number | null {
  const city = location.placeId ? cities.get(location.placeId) : undefined
  if (city !== undefined) return city
  return run.target.level === 'city' ? run.target.id : null
}

function skip(run: ImportRun, row: Row, reasons: string[]): undefined {
  run.skipped.push({ row: row.row, reasons, values: row.values })
  return undefined
}
