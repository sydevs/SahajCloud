import countryRegionData from 'country-region-data/data.json' with { type: 'json' }

export interface GeographyOption {
  label: string
  value: string
}

interface CountryRegionEntry {
  countryName: string
  countryShortCode: string
  regions: { name: string; shortCode: string }[]
}

/**
 * Imported from `country-region-data`'s bundled JSON (a plain array of
 * `{ countryName, countryShortCode, regions: [{ name, shortCode }] }`). The
 * JSON entry point is used — rather than the package's JS builds — because its
 * ESM/CJS/UMD default-export shapes differ across loaders (Payload CLI, Vitest,
 * the admin bundler); a JSON import resolves uniformly everywhere.
 */
const countries = countryRegionData as CountryRegionEntry[]

/**
 * Select options for every country (ISO 3166-1). Value = ISO alpha-2 short code
 * (e.g. `US`), label = English country name, sorted by label. This is the
 * single country source for the project (it replaced `i18n-iso-countries`); the
 * country-region-data set is 249 codes (it omits `SJ`/Svalbard).
 *
 * Used by the Audiences + WeMeditateAppStatus country selects and by the Atlas
 * address `country` dropdown (see `addressFields` / `StringSelectField`).
 */
export function getCountryOptions(): GeographyOption[] {
  return countries
    .map(({ countryName, countryShortCode }) => ({ label: countryName, value: countryShortCode }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Select options for the subdivisions (states / provinces / regions) of a
 * given country, keyed by its ISO alpha-2 code. Value = ISO 3166-2 subdivision
 * short code (e.g. `CA` for California within `US`), label = subdivision name.
 * Returns `[]` for an unknown/empty country code (e.g. before a country is
 * picked, or for countries with no listed subdivisions).
 *
 * Backs the cascading address `region` dropdown.
 */
export function getRegionOptions(countryCode: string | null | undefined): GeographyOption[] {
  if (!countryCode) return []
  const country = countries.find((entry) => entry.countryShortCode === countryCode)
  if (!country) return []
  return country.regions.map(({ name, shortCode }) => ({ label: name, value: shortCode }))
}
