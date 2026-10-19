/**
 * Great-circle distance and the mean point, both delegated to `@turf/*`.
 *
 * ⚠ **Our shape goes in, turf's never comes out.** `@turf/*` takes
 * `[longitude, latitude]` positions, the reverse of how every geocoded point in
 * this import is spelled, so the conversion is written once here rather than at
 * each of the four call sites that would otherwise each get it right or wrong.
 *
 * It lives here rather than in `src/lib/geography/` because the import is its
 * only owner, and a single-consumer module in the commons fails
 * `tests/unit/lib-boundary.spec.ts` (`src/AGENTS.md`). Move it there when a
 * second owner needs it.
 */

import { centroid } from '@turf/centroid'
import { distance } from '@turf/distance'

export interface Point {
  latitude: number
  longitude: number
}

const positionOf = ({ latitude, longitude }: Point): [number, number] => [longitude, latitude]

/**
 * Metres between two points, along the surface.
 *
 * Haversine on a sphere, not a geodesic: the two models disagree by about
 * 0.3%, which is centimetres over the 150 m this import compares addresses at
 * and tens of metres over the 25 km it merges metro areas at — neither close to
 * either threshold's own margin.
 *
 * ⚠ **turf answers NaN for an exactly antipodal pair**, where the hand-rolled
 * haversine this replaced clamped instead. Every comparison against a NaN
 * distance is false, so the import would stop detecting duplicates rather than
 * fail — and reaching it takes two addresses antipodal to the last bit of a
 * double, which no pair of venues in one region's CSV is.
 */
export function metersBetween(a: Point, b: Point): number {
  return distance(positionOf(a), positionOf(b), { units: 'meters' })
}

/**
 * Mean of the points, which is the one point that stands for a group of them.
 *
 * ⚠ **A mean of degrees, not of a sphere** — `@turf/centroid` averages the
 * vertices it is handed. It is wrong across the antimeridian and at the poles,
 * and right everywhere the import compares distances: its callers average a
 * city's own classes, which span kilometres. A sphere-correct centroid would be
 * the fix if a group ever straddles ±180°.
 */
export function centroidOf(points: readonly Point[]): Point {
  const [longitude, latitude] = centroid({
    type: 'MultiPoint',
    coordinates: points.map(positionOf),
  }).geometry.coordinates
  return { latitude, longitude }
}
