/**
 * Every threshold the bulk event import turns on, in one place.
 *
 * They are here rather than beside their users because a reviewer tuning the
 * import reads them as a set: the metro-merge radius and the state-layer
 * minimums together decide what the proposed tree looks like, and the duplicate
 * triple together decides what gets skipped. Spread across four modules they
 * could not be weighed against each other.
 */

/**
 * Hard cap on CSV data rows per batch.
 *
 * Bounds the resolve step's geocoder spend and the commit's write count, both
 * of which are per-row. A region with more classes than this uploads twice.
 */
export const MAX_IMPORT_ROWS = 500

/**
 * A `place` whose events all sit within this distance of a busier `place`
 * merges into it, as one metro city.
 *
 * Mapbox returns the administrative place, which splits a metro area across its
 * suburbs — eight nodes of two events each where a visitor expects one city.
 */
export const METRO_MERGE_RADIUS_KM = 25

/**
 * A state layer is proposed only for a batch spanning at least this many ISO
 * 3166-2 subdivisions AND yielding at least this many cities.
 *
 * Both, not either: two states and three cities is a flat list, and ten cities
 * in one state has no second state to separate. Below the bar the cities hang
 * directly off the country, which the live tree already does (FR).
 */
export const STATE_LAYER_MIN_SUBDIVISIONS = 2
export const STATE_LAYER_MIN_CITIES = 8

/**
 * An address shared by at least this many rows becomes a `venue` node under a
 * city target. Mirrors `seeds/atlas/helpers/venueRouter.ts`, so a venue reached
 * by import and a venue reached by the Atlas seed mean the same thing.
 */
export const VENUE_NODE_MIN_ROWS = 2

/**
 * The duplicate matcher's tolerances. A candidate matches an existing event on
 * either rule:
 *
 *  - same city + an overlapping weekday + a start time within `MINUTES`
 *  - an address within `METERS` + the same weekday
 *
 * The city rule catches the same class re-listed with a retyped address. The
 * address rule catches two classes at one venue whose times were rounded
 * differently. Neither is tight enough alone.
 */
export const DUPLICATE_START_TIME_MINUTES = 30
export const DUPLICATE_ADDRESS_METERS = 150
