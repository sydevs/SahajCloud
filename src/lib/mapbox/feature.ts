/**
 * One Mapbox Geocoding v6 feature, as the two readers of a v6 answer see it:
 * the server-side forward geocoder (`geocoder.ts`) and the admin location
 * picker (`@/components/admin/AddressSearchField/pickedPlace`).
 *
 * ⚠ **Three things stop the library's own `GeocodingFeature` standing in
 * here.** `@mapbox/search-js-core`, which declares it, is not a dependency of
 * this repo — only `@mapbox/search-js-react` is, and it re-exports none of the
 * geocoding types. Its `GeocodingFeatureContextComponent` declares neither
 * `region_code`/`region_code_full` nor `country_code`, which the picker reads
 * to fill the address siblings, though Mapbox's reference documents all three.
 * And every field it declares is required, which holds for a body its own
 * client parsed and not for the one the server reader is handed.
 *
 * The picker's mount is what keeps the two compatible: the library types
 * `onRetrieve` as `(feature: GeocodingFeature) => void`, so a shape this type
 * stops accepting fails to compile there.
 */

/** One layer of a feature's parent hierarchy. */
export interface MapboxContextLayer {
  /**
   * ⚠ **A context layer's id arrives under one of two keys.**
   * `@mapbox/search-js-core` spells it `id` in its Search Box types
   * (`dist/searchbox/types.d.ts`, `ContextEntry`) and `mapbox_id` in its
   * Geocoding ones. Reading both is the only way to be right either way, and
   * `contextLayerId` is where that choice lives.
   */
  id?: string
  mapbox_id?: string
  name?: string
  /** `region` only: the ISO 3166-2 code, bare and country-prefixed. */
  region_code?: string
  region_code_full?: string
  /** `country` only: the ISO 3166-1 alpha-2 code. */
  country_code?: string
}

export interface MapboxFeature {
  geometry?: { coordinates?: number[] }
  properties?: {
    mapbox_id?: string
    name?: string
    /** `address`, `street`, `postcode`, `place`, `locality`… */
    feature_type?: string
    context?: {
      address?: MapboxContextLayer
      street?: MapboxContextLayer
      postcode?: MapboxContextLayer
      place?: MapboxContextLayer
      locality?: MapboxContextLayer
      region?: MapboxContextLayer
      country?: MapboxContextLayer
    }
  }
}
