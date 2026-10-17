import countryRegionData from 'country-region-data/data.json' with { type: 'json' }

export interface GeographyOption {
  label: string
  value: string
}

interface CountryRegionEntry {
  countryName: string
  countryShortCode: string
  regions: { name: string; shortCode?: string }[]
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
 * ⚠ **A subdivision the dataset lists without a code is left out.** All of
 * `PR`'s and `FO`'s, one of `KZ`'s and `MK`'s, and most small territories' have
 * none, and an option with no value is one no select can store and every
 * caller's `.toUpperCase()` throws on.
 *
 * Backs the cascading address `region` dropdown.
 */
export function getRegionOptions(countryCode: string | null | undefined): GeographyOption[] {
  if (!countryCode) return []
  const country = countries.find((entry) => entry.countryShortCode === countryCode)
  if (!country) return []
  return country.regions.flatMap(({ name, shortCode }) =>
    shortCode ? [{ label: name, value: shortCode }] : [],
  )
}

/** Whether `value` is an ISO alpha-2 code this project's country set lists. */
export function isCountryCode(value: string | null | undefined): boolean {
  if (!value) return false
  return countries.some((entry) => entry.countryShortCode === value)
}

/** The ISO alpha-2 code for an English country name, or null. */
export function countryCodeForName(name: string | null | undefined): string | null {
  const needle = name?.trim().toLowerCase()
  if (!needle) return null
  return (
    countries.find((entry) => entry.countryName.toLowerCase() === needle)?.countryShortCode ?? null
  )
}

/**
 * The ISO 3166-2 subdivision code behind a Mapbox `context.region` entry, or null.
 *
 * ⚠ **Mapbox spells the answer three ways and only sometimes the first.**
 * `region_code` is usually the bare code (`CA`), but some results carry only the
 * country-prefixed `region_code_full` (`US-CA`), and some only a name. So each
 * fallback below covers a result shape the one above it misses, and dropping one
 * leaves the subdivision empty for whole countries rather than for odd rows.
 *
 * ⚠ **The answer is the code `getRegionOptions` lists wherever one matches**,
 * because that list is what an address `region` select stores and a target is
 * confined by. Mapbox's own code is returned only when nothing in the list
 * answers to its code or its name — `ENG` for England, which `GB`'s councils
 * do not include. See `SUBDIVISION_CODE_ALIASES` for where the two disagree.
 *
 * The name match needs `countryCode` because a subdivision name is unique only
 * within its country.
 */
export function resolveSubdivisionCode(
  region: { region_code?: string; region_code_full?: string; name?: string } | undefined | null,
  countryCode: string | null | undefined,
): string | null {
  if (!region) return null
  const code =
    region.region_code ||
    (region.region_code_full?.includes('-') ? region.region_code_full.split('-').pop() : null) ||
    null
  const index = indexFor(countryCode)
  const listed =
    (code && index?.codes.get(code.toLowerCase())) ||
    (region.name && index && byName(index, region.name)) ||
    null
  return listed ?? code
}

/**
 * The ISO 3166-2 subdivision code a piece of text names, or null.
 *
 * The subdivision twin of `countryCodeForName`, and deliberately more forgiving
 * than `resolveSubdivisionCode` above: that one reads a Mapbox answer, where the
 * code arrives under its own key. This one reads text a person typed or a slug
 * carries, so it accepts either spelling of an option — the code (`BY`) or the
 * name — and matches without regard to case, accents, or the words one spelling
 * of a name carries and another drops ("Comunidad de Madrid" is `Madrid`).
 *
 * ⚠ **ISO lists the endonym, so an English exonym does not match.** `DE` holds
 * `Bayern`, never `Bavaria`. A caller with a geocoded answer should prefer it
 * over this.
 *
 * ⚠ **Indexed per country, because a caller may ask per row.** `getRegionOptions`
 * re-scans 249 countries and allocates an object per subdivision on each call —
 * 217 of them for `GB`. The index is built once per country and bounded by the
 * 249 the table holds, which is why an unknown country is never cached.
 */
export function subdivisionCodeFor(
  countryCode: string | null | undefined,
  text: string | null | undefined,
): string | null {
  const needle = text?.trim().toLowerCase()
  const index = indexFor(countryCode)
  if (!needle || !index) return null
  // Codes first, so a code wins where it collides with some other
  // subdivision's name.
  return index.codes.get(needle) ?? byName(index, needle)
}

/**
 * Codes Mapbox answers with for a subdivision the dataset lists under another,
 * per country.
 *
 * ⚠ **Each is a scheme mismatch, so a state target there refused every row.**
 * Mapbox returns Spain's autonomous communities where `country-region-data`
 * lists provinces, so only the communities that are one province have a code
 * to map to — Catalonia is four, and stays unmatched. India's are ISO renames
 * the dataset predates, and the two territories ISO merged into `DH`.
 */
const SUBDIVISION_CODE_ALIASES: Partial<Record<string, Record<string, string>>> = {
  ES: { MD: 'M', AS: 'O', CB: 'S', RI: 'LO', IB: 'PM', MC: 'MU', NC: 'NA' },
  IN: { CG: 'CT', UK: 'UT', OD: 'OR', TS: 'TG', DN: 'DH', DD: 'DH' },
}

/** The words one spelling of a subdivision's name carries and another drops. */
const GENERIC_NAME_WORDS = new Set([
  'autonomous',
  'community',
  'comunidad',
  'comunitat',
  'de',
  'del',
  'el',
  'foral',
  'la',
  'of',
  'principado',
  'principality',
  'province',
  'provincia',
  'region',
  'state',
  'the',
])

/** A name reduced to the words that tell one subdivision from another. */
function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word && !GENERIC_NAME_WORDS.has(word))
    .join(' ')
}

interface SubdivisionIndex {
  codes: Map<string, string>
  names: Map<string, string>
}

function byName(index: SubdivisionIndex, name: string): string | null {
  const exact = name.trim().toLowerCase()
  return index.names.get(exact) ?? index.names.get(nameKey(exact)) ?? null
}

/** The country's index, or null for a code the table does not hold — which is never cached. */
function indexFor(countryCode: string | null | undefined): SubdivisionIndex | null {
  const country = countryCode?.trim().toUpperCase()
  return country && isCountryCode(country) ? subdivisionIndexFor(country) : null
}

const subdivisionIndexes = new Map<string, SubdivisionIndex>()

function subdivisionIndexFor(country: string): SubdivisionIndex {
  const cached = subdivisionIndexes.get(country)
  if (cached) return cached

  const options = getRegionOptions(country)
  const codes = new Map<string, string>()
  const names = new Map<string, string>()
  const prefix = `${country.toLowerCase()}-`
  for (const { label, value } of options) {
    const code = value.toLowerCase()
    codes.set(code, value)
    // `DK` and `FI` list `DK-84` where Mapbox and a person both write `84`.
    if (code.startsWith(prefix)) codes.set(code.slice(prefix.length), value)
    // A label like `Navarra/Nafarroa` lists both languages' names.
    for (const spelling of label.split('/')) names.set(spelling.trim().toLowerCase(), value)
  }
  for (const [alias, value] of Object.entries(SUBDIVISION_CODE_ALIASES[country] ?? {})) {
    if (!codes.has(alias.toLowerCase())) codes.set(alias.toLowerCase(), value)
  }
  // Reduced names go in last and never displace an exact one: two names can
  // reduce to the same words, and the exact spelling is the stronger match.
  for (const { label, value } of options) {
    for (const spelling of label.split('/')) {
      const key = nameKey(spelling)
      if (key && !names.has(key)) names.set(key, value)
    }
  }

  const index = { codes, names }
  subdivisionIndexes.set(country, index)
  return index
}
