import tzlookup from '@photostructure/tz-lookup'

import { isSupportedTimezone } from '@/lib/timezones'
import type { SupportedTimezones } from '@/payload-types'

export type TimezoneResult =
  { ok: true; timezone: SupportedTimezones } | { ok: false; error: string }

/** The zone at a point, narrowed to one the `firstDate_tz` column stores. */
export function timezoneAt(latitude: number, longitude: number): TimezoneResult {
  let zone: string
  try {
    zone = tzlookup(latitude, longitude)
  } catch {
    return { ok: false, error: `no timezone covers ${latitude}, ${longitude}` }
  }
  return isSupportedTimezone(zone)
    ? { ok: true, timezone: zone }
    : { ok: false, error: `timezone "${zone}" is not one this CMS stores` }
}
