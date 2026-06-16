import { getTimeZones } from '@vvo/tzdb'
import { defaultTimezones } from 'payload/shared'

export interface TimezoneOption {
  label: string
  value: string
}

/**
 * The full IANA timezone set, sourced deterministically from the **pinned**
 * `@vvo/tzdb` package (its bundled tz database). We do NOT use
 * `Intl.supportedValuesOf('timeZone')`: every `timezone: true` companion and the
 * Regions `eventDefaults.timeZone` select bakes a Postgres enum from this list,
 * so it MUST be identical on the machine that generates the migration and on
 * every runtime — and `Intl` varies with the host's ICU version (e.g.
 * `Asia/Calcutta` vs `Asia/Kolkata`). A pinned package is identical everywhere.
 *
 * Built once at module load: Payload's curated `defaultTimezones` first (keeping
 * their friendly labels), then every `@vvo/tzdb` zone **and its aliases** — so
 * legacy IANA names the Atlas data uses (`Europe/Kiev`, `Australia/Melbourne`,
 * `America/Belem`, …) resolve, not just the canonical `Europe/Kyiv` /
 * `Australia/Sydney`. Bumping `@vvo/tzdb` widens the enums → needs a migration.
 */
export const SUPPORTED_TIMEZONES: TimezoneOption[] = (() => {
  const byValue = new Map<string, TimezoneOption>()
  // `@vvo/tzdb` omits plain `UTC`; seed it as a first-class option.
  byValue.set('UTC', { label: '(UTC+00:00) Coordinated Universal Time', value: 'UTC' })
  for (const { label, value } of defaultTimezones) {
    if (!byValue.has(value)) byValue.set(value, { label, value })
  }
  for (const zone of getTimeZones()) {
    for (const value of [zone.name, ...zone.group]) {
      if (!byValue.has(value)) byValue.set(value, { label: zone.rawFormat, value })
    }
  }
  return [...byValue.values()]
})()

/**
 * Select options for the Atlas Regions `eventDefaults.timeZone` (multi-select).
 * The same list backs `admin.timezones.supportedTimezones` in the Payload config
 * (the `timezone: true` companion fields), so the picker and the columns agree.
 */
export function getTimezoneOptions(): TimezoneOption[] {
  return SUPPORTED_TIMEZONES
}
