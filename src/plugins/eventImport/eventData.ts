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
import type { GeocodedLocation } from '@/lib/mapbox/geocoder'
import { plainTextToLexical } from '@/lib/richEditor/plainTextToLexical'
import type { Event, SupportedTimezones } from '@/payload-types'

import { mapCsvSchedule } from './csv/schedule'

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
  { ok: true; data: Record<string, unknown> } | { ok: false; errors: string[] }

export function eventCreateData(args: EventDataArgs): EventDataResult {
  const { values, location, timezone, today, regionId, managerId, importBatch } = args

  const schedule = mapCsvSchedule(values, timezone, today)
  if (!schedule.ok) return { ok: false, errors: schedule.errors }

  const eventType: Event['eventType'] = values.eventType === 'online' ? 'online' : 'offline'
  const scheduled = schedule.inactive ? {} : { schedule: schedule.schedule }
  // Payload's own select validation refuses a code the CMS does not list.
  const languages = [...new Set(splitList(values.languages?.toLowerCase()))]

  const data: Record<string, unknown> = {
    // `newEventDefaults` reads the schedule only to derive `inactive`.
    ...newEventDefaults(scheduled, managerId),
    ...scheduled,
    title: values.title,
    languages: languages.length ? languages : [...args.defaultLanguages],
    description: plainTextToLexical(values.description) ?? null,
    website: values.website || null,
    contactName: values.contactName || null,
    contactPhone: values.contactPhone || null,
    contactEmail: values.contactEmail || null,
    region: regionId,
    eventType,
    onlineUrl: eventType === 'online' ? values.onlineUrl || null : null,
    ...(eventType === 'offline' ? { address: addressFor(values, location) } : {}),
    registrationMode: 'sahaj-atlas',
    registrationLimit: values.registrationLimit ? Number(values.registrationLimit) : null,
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
    venueName: values.venueName || null,
    street: values.address || null,
    room: values.room || null,
    postCode: values.postcode || null,
    country: values.country?.toUpperCase() || null,
    region: values.state || null,
    city: values.city || null,
    latitude: location.latitude,
    longitude: location.longitude,
  }
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}
