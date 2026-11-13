/**
 * What one picked Mapbox Geocoding v6 feature fills in, as plain data.
 *
 * Kept out of the field component because every export of a `'use client'`
 * module reaches a server module as a client reference, so nothing declared
 * there can be read by a spec — and the response mapping is exactly the part
 * that moves when Mapbox's shape does. It moved once already, when the stored
 * path left Search Box for v6 (#893).
 */

import { getRegionOptions } from '@/lib/geography'

/** Subset of a Mapbox Geocoding v6 feature that the picker reads. */
export interface MapboxGeocodingFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    mapbox_id?: string
    name?: string
    context?: {
      address?: { name?: string }
      place?: { name?: string }
      region?: { region_code?: string; region_code_full?: string; name?: string }
      postcode?: { name?: string }
      country?: { country_code?: string; name?: string }
    }
  }
}

/** The sibling address fields a picked feature fills, by field name. */
export interface PickedAddress {
  street?: string
  city?: string
  region?: string
  country?: string
  postCode?: string
  latitude?: number
  longitude?: number
}

export interface PickedPlace {
  address: PickedAddress
  /** The place's own name, for a field that adopts it (Regions). */
  name?: string
  /** The feature's own id; absent where Mapbox returned none. */
  mapboxId?: string
}

/**
 * Resolve the address subdivision to a code our region dropdown understands.
 * Mapbox usually returns a bare ISO 3166-2 code (`region_code`, e.g. `CA`), but
 * not for every result — so fall back to the country-prefixed
 * `region_code_full` (`US-CA` → `CA`), then to matching the region name against
 * our country-region-data options. This populates `region` whenever Mapbox
 * gives us anything to match on.
 */
export function resolveRegionCode(
  region: { region_code?: string; region_code_full?: string; name?: string } | undefined,
  countryCode: string | undefined,
): string | undefined {
  if (!region) return undefined
  if (region.region_code) return region.region_code
  if (region.region_code_full?.includes('-')) return region.region_code_full.split('-').pop()
  if (region.name && countryCode) {
    const name = region.name.toLowerCase()
    const match = getRegionOptions(countryCode).find(
      (option) => option.label.toLowerCase() === name,
    )
    if (match) return match.value
  }
  return undefined
}

/**
 * Read a picked feature into the values the field writes.
 *
 * ⚠ **The street is the `address` context layer, not a property of its own.**
 * Search Box answered with `properties.address`; v6 has no such key, and a
 * feature coarser than a door has no address layer either — so the feature's
 * own `name` is what stands in, which for a street or a town is that street or
 * town.
 */
export function readPickedPlace(feature: MapboxGeocodingFeature): PickedPlace {
  const properties = feature.properties
  const context = properties?.context
  const coordinates = feature.geometry?.coordinates
  return {
    address: {
      street: context?.address?.name ?? properties?.name,
      city: context?.place?.name,
      region: resolveRegionCode(context?.region, context?.country?.country_code),
      country: context?.country?.country_code,
      postCode: context?.postcode?.name,
      ...(coordinates ? { longitude: coordinates[0], latitude: coordinates[1] } : {}),
    },
    name: properties?.name,
    mapboxId: properties?.mapbox_id,
  }
}
