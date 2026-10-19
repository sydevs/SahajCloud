/**
 * One CSV row as the `events` document the import creates.
 *
 * Built on `newEventDefaults`, the contract every new listing shares with the
 * submission review, so an imported class and an accepted proposal start the
 * same way. The row is created as a draft: the volunteer publishes it from the
 * Events list once they have looked it over.
 */

import type { RawImportRow } from './csv/columns'
import type { Temporal } from '@js-temporal/polyfill'

import { newEventDefaults } from '@/collections/UserSubmissions/lifecycle/mergeProposal'
import { getLanguageOptions } from '@/lib/locales'
import type { GeocodedLocation } from '@/lib/mapbox/geocoder'
import { plainTextToLexical } from '@/lib/richEditor/plainTextToLexical'
import type { Event, SupportedTimezones } from '@/payload-types'

import { mapCsvSchedule, scheduleArgsFor } from './csv/schedule'

export interface EventDataArgs {
  values: RawImportRow
  location: GeocodedLocation
  timezone: SupportedTimezones
  /** Today in the row's own zone, which "has already passed" is measured against. */
  today: Temporal.PlainDate
  regionId: number
  managerId: number | null
  importBatch: number
  defaultLanguages: readonly string[]
}

export type EventDataResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; errors: string[] }

const LANGUAGE_CODES: ReadonlySet<string> = new Set(
  getLanguageOptions().map((option) => option.value),
)

export function eventCreateData(args: EventDataArgs): EventDataResult {
  const { values, location, timezone, today, regionId, managerId, importBatch } = args

  const schedule = mapCsvSchedule(scheduleArgsFor(values, timezone, today))
  if (!schedule.ok) return { ok: false, errors: schedule.errors }

  const languages = resolveLanguages(values.languages, args.defaultLanguages)
  if (!languages.ok) return { ok: false, errors: [languages.error] }

  const eventType: Event['eventType'] = values.eventType === 'online' ? 'online' : 'offline'
  const scheduled = schedule.inactive ? {} : { schedule: schedule.schedule }
  const limit = values.registrationLimit?.trim()

  const data: Record<string, unknown> = {
    // `newEventDefaults` reads the schedule only to derive `inactive`.
    ...newEventDefaults(scheduled, managerId),
    ...scheduled,
    title: values.title?.trim() || '',
    languages: languages.codes,
    description: plainTextToLexical(values.description) ?? null,
    website: values.website?.trim() || null,
    contactName: values.contactName?.trim() || null,
    contactPhone: values.contactPhone?.trim() || null,
    contactEmail: values.contactEmail?.trim() || null,
    region: regionId,
    eventType,
    onlineUrl: eventType === 'online' ? values.onlineUrl?.trim() || null : null,
    ...(eventType === 'offline' ? { address: addressFor(values, location) } : {}),
    registrationMode: 'sahaj-atlas',
    registrationLimit: limit ? Number(limit) : null,
    importBatch,
    // ⚠ Overrides `newEventDefaults`' `published`: the plugin honours a
    // `_status` the row carries, and the review is the draft list.
    _status: 'draft',
  }
  return { ok: true, data }
}

function addressFor(values: RawImportRow, location: GeocodedLocation): Record<string, unknown> {
  return {
    // The feature id names a door; a street or town match is a point only.
    mapboxId: location.featureType === 'address' ? location.mapboxId : null,
    venueName: values.venueName?.trim() || null,
    street: values.address?.trim() || null,
    room: values.room?.trim() || null,
    postCode: values.postcode?.trim() || null,
    country: values.country?.trim().toUpperCase() || null,
    region: values.state?.trim() || null,
    city: values.city?.trim() || null,
    latitude: location.latitude,
    longitude: location.longitude,
  }
}

function resolveLanguages(
  column: string | undefined,
  fallback: readonly string[],
): { ok: true; codes: string[] } | { ok: false; error: string } {
  const codes = (column ?? '')
    .split(',')
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean)
  if (!codes.length) return { ok: true, codes: [...fallback] }
  const unknown = codes.filter((code) => !LANGUAGE_CODES.has(code))
  if (unknown.length) {
    return { ok: false, error: `languages has codes the CMS does not list (got "${unknown.join(', ')}")` }
  }
  return { ok: true, codes: [...new Set(codes)] }
}
