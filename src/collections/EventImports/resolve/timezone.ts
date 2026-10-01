/**
 * The timezone a row's coordinates sit in, narrowed to what the column stores.
 *
 * ⚠ **The zone has to come from the coordinates, not from the country.** A
 * country cannot answer it at all for the dozen countries spanning several
 * zones, and `scheduleFields` writes every recurrence against this one value —
 * so a wrong zone moves a class by hours and no later read can tell.
 *
 * The lookup is offline, against `tz-lookup`'s bundled boundary data: a
 * per-row HTTP call would add a second network dependency to the resolve step
 * for an answer that never changes.
 */

import tzlookup from 'tz-lookup'

import { SUPPORTED_TIMEZONES } from '@/lib/timezones'
import type { SupportedTimezones } from '@/payload-types'

/**
 * ⚠ **The membership test runs against the list the Payload config installs**,
 * never a copy. `firstDate_tz` is a Postgres enum baked from
 * `SUPPORTED_TIMEZONES`, so a zone absent from it is a row the database refuses
 * at write — the one failure this check turns into a reported row instead.
 */
const SUPPORTED = new Set<string>(SUPPORTED_TIMEZONES.map(({ value }) => value))

function isSupported(zone: string): zone is SupportedTimezones {
  return SUPPORTED.has(zone)
}

export type DeriveTimezoneResult =
  | { ok: true; timezone: SupportedTimezones }
  /** Shown to the volunteer as the row's error. */
  | { ok: false; error: string }

function unsupported(zone: string): DeriveTimezoneResult {
  return { ok: false, error: `timezone "${zone}" is not one this CMS stores` }
}

/**
 * The zone for a point, or the reason the row cannot carry one.
 *
 * The row's own `timezone` column overrides the lookup and is checked the same
 * way: a volunteer correcting a border case must not be able to write a value
 * the enum lacks either.
 */
export function deriveImportTimezone(args: {
  latitude: number
  longitude: number
  override?: string
  /**
   * The boundary lookup, injected only so a spec can return a zone the enum
   * lacks. No such zone can be produced from coordinates — `tz-lookup`'s own
   * set is currently a subset of the column's — so without this seam the
   * narrowing below is unreachable and would read as covered while deleted.
   */
  lookup?: (latitude: number, longitude: number) => string
}): DeriveTimezoneResult {
  const override = args.override?.trim()
  if (override) {
    return isSupported(override) ? { ok: true, timezone: override } : unsupported(override)
  }

  let zone: string
  try {
    zone = (args.lookup ?? tzlookup)(args.latitude, args.longitude)
  } catch {
    return { ok: false, error: `no timezone covers ${args.latitude}, ${args.longitude}` }
  }

  // A zone the boundary data knows and the enum does not is a tzdb version gap
  // rather than a bad row, so the message names the zone — that is what tells a
  // maintainer to bump `@vvo/tzdb` and migrate the enum instead of editing CSV.
  return isSupported(zone) ? { ok: true, timezone: zone } : unsupported(zone)
}
