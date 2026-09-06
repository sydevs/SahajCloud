/**
 * Venue routing for the Atlas import. There is no Venues collection: a place
 * referenced by more than one event becomes a Regions `venue` node, and
 * events point their `region` at it. A single-use venue's address is
 * lifted inline onto the event's `address` group. These are pure
 * helpers. The actual node creation and Mapbox geocoding live in the
 * importer.
 */

export interface AtlasVenue {
  legacyId: number
  placeId: string | null
  name: string | null
  street: string | null
  city: string | null
  countryCode: string | null
  postCode: string | null
  regionCode: string | null
  latitude: number | null
  longitude: number | null
  timeZone: string | null
}

/** The two event fields venue routing reads. */
export interface VenueEventRef {
  venueId: number | null
  areaId: number | null
}

/** Count events per venue (events with no venue are ignored). */
export function countVenueUsage(events: VenueEventRef[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const event of events) {
    if (event.venueId == null) continue
    counts.set(event.venueId, (counts.get(event.venueId) ?? 0) + 1)
  }
  return counts
}

/** Venues referenced by more than one event → become Regions `venue` nodes. */
export function multiUseVenueIds(events: VenueEventRef[]): Set<number> {
  const ids = new Set<number>()
  for (const [venueId, count] of countVenueUsage(events)) {
    if (count > 1) ids.add(venueId)
  }
  return ids
}

/**
 * The area (→ city) a venue's region node should hang under: the most common
 * `areaId` among the events that reference it (ties broken by first seen).
 * Null when none of its events carry an area.
 */
export function venueParentAreaId(venueId: number, events: VenueEventRef[]): number | null {
  const counts = new Map<number, number>()
  for (const event of events) {
    if (event.venueId !== venueId || event.areaId == null) continue
    counts.set(event.areaId, (counts.get(event.areaId) ?? 0) + 1)
  }
  let best: number | null = null
  let bestCount = 0
  for (const [areaId, count] of counts) {
    if (count > bestCount) {
      best = areaId
      bestCount = count
    }
  }
  return best
}

const addressTokens = (value: string): string =>
  value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .sort()
    .join(' ')

/**
 * True when a venue's `name` adds nothing over its address. Atlas is full of
 * venues named after their own street ("R. Direita, 165", "22 Manenburgstraat")
 * or simply after their city (venue 483 is named "Воронеж", in Воронеж) — using
 * either as the place in an auto-title is no better than the street, and the
 * city one is worse. Compared as a bag of alphanumeric tokens so word order,
 * punctuation and house-number position do not matter.
 */
export function isRedundantVenueName(name: string, venue: AtlasVenue): boolean {
  const tokens = addressTokens(name)
  if (!tokens) return true
  return (
    (!!venue.street && tokens === addressTokens(venue.street)) ||
    (!!venue.city && tokens === addressTokens(venue.city))
  )
}

/** Strip trailing separators an Atlas venue name often carries ("Orka ,", "…House,"). */
export function cleanVenueName(name: string): string {
  return name.replace(/[\s,;:.\-–—]+$/u, '').trim()
}

/** A display name for a shared-venue node: the venue name, else its street/city. */
export function venueDisplayName(venue: AtlasVenue): string {
  const name = venue.name?.trim()
  if (name) return name
  const parts = [venue.street?.trim(), venue.city?.trim()].filter(Boolean)
  return parts.join(', ') || `Venue ${venue.legacyId}`
}

/** The event `address` group shape (mapboxId resolved by the caller's geocoder). */
export interface EventAddress {
  mapboxId: string
  venueName?: string
  street?: string
  postCode?: string
  country?: string
  region?: string
  city?: string
  latitude?: number
  longitude?: number
}

/**
 * Lift a venue's address onto an event's inline `address` group. The
 * caller resolves `mapboxId` (a geocoded real id, or `manual`). Empty
 * fields are omitted. The venue's own coordinates back the manual
 * fallback.
 *
 * `venueName` carries the building's own name. Atlas has one on most venues and
 * it was previously discarded here, leaving a listing with nothing but a street
 * — so a blank title auto-filled to "Meditation at 9 St Peter's Park Rd" rather
 * than naming the meeting house. Dropped again when it merely repeats the
 * street or the city (see isRedundantVenueName).
 */
export function venueToEventAddress(venue: AtlasVenue, mapboxId: string): EventAddress {
  const address: EventAddress = { mapboxId }
  const street = venue.street?.trim()
  const venueName = cleanVenueName(venue.name ?? '')
  if (venueName && !isRedundantVenueName(venueName, venue)) address.venueName = venueName
  if (street) address.street = street
  if (venue.city) address.city = venue.city
  if (venue.countryCode) address.country = venue.countryCode
  if (venue.regionCode) address.region = venue.regionCode
  if (venue.postCode) address.postCode = venue.postCode
  if (venue.latitude != null) address.latitude = venue.latitude
  if (venue.longitude != null) address.longitude = venue.longitude
  return address
}
