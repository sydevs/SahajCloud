import { defaultTimezones } from 'payload/shared'

export interface TimezoneOption {
  label: string
  value: string
}

/**
 * Select options for IANA timezones, sourced from Payload's bundled
 * `defaultTimezones` — the same list its native `timezone: true` fields
 * use (so the picker matches the schedule field's timezone UX).
 *
 * Why this source and not `Intl.supportedValuesOf('timeZone')`: every
 * `select` field becomes a Postgres enum baked into the migration, so the
 * option list MUST be deterministic across the maintainer's machine (which
 * generates the migration) and every runtime. `Intl.supportedValuesOf`
 * varies with the host's ICU version (e.g. `Asia/Calcutta` vs
 * `Asia/Kolkata`), which would let the admin UI offer values the column's
 * enum rejects. `defaultTimezones` ships with the pinned payload package,
 * so it is identical everywhere.
 *
 * Shared by the Atlas Regions `timeZone` (multi-select) and Events
 * `address.timeZone` fields.
 *
 * NOTE: this is the curated ~47-zone set (roughly one representative per
 * major UTC offset). If the Phase 3 Atlas importer needs zones beyond it,
 * widen the list here from a deterministic source — do NOT switch to
 * `Intl.supportedValuesOf` (see above).
 */
export function getTimezoneOptions(): TimezoneOption[] {
  return defaultTimezones.map(({ label, value }) => ({ label, value }))
}
