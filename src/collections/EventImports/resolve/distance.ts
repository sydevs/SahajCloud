/**
 * Great-circle distance between two points.
 *
 * Haversine on a sphere, not a geodesic: the two models disagree by about
 * 0.3%, which is centimetres over the 150 m this import compares addresses at
 * and tens of metres over the 25 km it merges metro areas at — neither close to
 * either threshold's own margin.
 *
 * It lives here rather than in `src/lib/geography/` because the import is its
 * only owner, and a single-consumer module in the commons fails
 * `tests/unit/lib-boundary.spec.ts` (`src/AGENTS.md`). Move it there when a
 * second owner needs it.
 */

/** IUGG mean earth radius, the value that minimises haversine's error. */
const EARTH_RADIUS_METERS = 6_371_008.8

export interface Point {
  latitude: number
  longitude: number
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/** Metres between two points, along the surface. */
export function metersBetween(a: Point, b: Point): number {
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const halfLat = toRadians(b.latitude - a.latitude) / 2
  const halfLon = toRadians(b.longitude - a.longitude) / 2

  const h = Math.sin(halfLat) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(halfLon) ** 2

  // ⚠ The clamp is unreachable at double precision and stays anyway: `h` tops
  // out at one ulp above 1 for an antipodal pair, which `sqrt` rounds back to
  // exactly 1. What it guards is the consequence — `Math.asin` above 1 is NaN,
  // every comparison against a NaN distance is false, so the import would stop
  // detecting duplicates rather than fail.
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}
