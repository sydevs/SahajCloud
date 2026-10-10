/**
 * Thresholds the bulk event import turns on.
 *
 * A later step's own numbers arrive with the code that reads them, so a reviewer
 * can check each against behaviour and a wrong value fails something.
 */

/**
 * Hard cap on CSV data rows per batch.
 *
 * Bounds the resolve step's geocoder spend and the commit's write count, both
 * of which are per-row. A region with more classes than this uploads twice.
 */
export const MAX_IMPORT_ROWS = 500

/**
 * The queue both import jobs run on.
 *
 * Its own queue, not `nightly` or `screening`: a 500-row resolve holds a worker
 * for minutes, and sharing a queue with the submission screening would delay
 * every public write behind one volunteer's upload. `JOB_AUTO_RUN`
 * (`src/jobs/queues.ts`) is what drives it, and is the safety net for a run lost
 * to a restart.
 */
export const IMPORT_QUEUE = 'imports'

/**
 * How many rows the resolve job geocodes at once.
 *
 * Mapbox's own rate limit for a temporary-geocoding token is 600 requests a
 * minute, which four in flight never approaches; the bound is there so a 500-row
 * batch does not open 500 sockets. Higher buys little — a geocode is about
 * 200 ms, so four already outruns the write-back.
 */
export const RESOLVE_CONCURRENCY = 4

/**
 * How many rows the resolve job gets through between `progress` writes.
 *
 * Each write is a full document save, and the document carries up to
 * `MAX_IMPORT_ROWS` rows plus its tree — so one per row would re-serialise the
 * batch 500 times for a bar nobody watches that closely. Ten is about two
 * seconds of work at `RESOLVE_CONCURRENCY`.
 */
export const PROGRESS_EVERY_ROWS = 10

/**
 * How long a batch is kept after its last change, whatever its status.
 *
 * One number for every status, because what sets the window is the CSV: it
 * holds the contact names, addresses and phone numbers a volunteer collected,
 * and a finished batch keeps them no more legitimately than a discarded one.
 * Long enough for a volunteer to come back and download their skipped rows, and
 * for an admin to look at a batch that failed.
 */
export const IMPORT_RETENTION_DAYS = 30

/**
 * How far apart two start times may be and still be the same class.
 *
 * A volunteer's CSV and the CMS rarely agree to the minute on when a class
 * begins — one says the doors open, the other when the meditation starts. Wide
 * enough to catch that, narrow enough that a morning and an evening class in
 * one city stay two classes.
 */
export const DUPLICATE_START_WINDOW_MINUTES = 30

/**
 * How close two addresses may be and still be one venue.
 *
 * Geocoding the same hall from two differently-spelled addresses lands within a
 * building's width, not on the same point. Above this it starts merging
 * neighbours on one street, so a shared address is matched rather than a
 * shared street.
 */
export const DUPLICATE_ADDRESS_METERS = 150

/**
 * How far apart two points in one town may be and still be a *possible*
 * duplicate at the same time.
 *
 * Wide enough for a hall whose two listings geocoded to opposite ends of its
 * block, narrow enough that two halls across a city — Camden and Brixton, 9 km
 * apart, both Tuesday 19:00 — stay two classes. A match in this band is `weak`:
 * the review badges it and the reviewer decides.
 */
export const WEAK_DUPLICATE_METERS = 1_000

/**
 * How far a smaller place may sit from a larger one and still be its metro area.
 *
 * A city's classes are spread across its suburbs, and Mapbox names each suburb
 * its own `place` — so without a merge an Indian metro arrives as a dozen
 * sibling cities a seeker has to guess between. Wide enough to take in a
 * commuter belt, narrow enough that two towns an hour apart stay two cities.
 */
export const METRO_MERGE_METERS = 25_000

/**
 * How many rows must share an address before it becomes a `venue` node.
 *
 * The same rule the Atlas tree was seeded under (`multiUseVenueIds`,
 * `seeds/atlas/helpers/venueRouter.ts`): a hall two classes meet at is worth
 * naming once, and a hall one class meets at is that event's own address.
 */
export const SHARED_VENUE_MIN_ROWS = 2

/**
 * The smallest radius a hand-located node is given, per level.
 *
 * A proposed node with no Mapbox feature behind it is written as a manual
 * location, and `Regions.radius` is required for one. Measured from what the
 * node holds, the reach is 0 for a hall at one address and for a state the
 * batch reached through a single city — a point rather than a place.
 *
 * ⚠ **The floor is per level because the measurement cannot be trusted to
 * imply one.** A state is not town-sized just because this batch found one
 * class in it, and the two siblings of a split layer would otherwise differ by
 * three orders of magnitude. The venue and region values are the Atlas seed's
 * own defaults for a hand-located node (`DEFAULT_VENUE_RADIUS_METERS`,
 * `src/lib/mapbox/geocoder.ts`), so the two writers of this column agree; the
 * city value is ours, since the seed gives a city the same 50 km as a state.
 */
export const MANUAL_RADIUS_MIN_METERS: Record<'region' | 'city' | 'venue', number> = {
  region: 50_000,
  city: 1_000,
  venue: 500,
}

/**
 * How many subdivisions a batch must span before a state layer is proposed.
 *
 * One state is not a layer: every city would hang off the single node, which
 * adds a click to every path through the tree and tells a seeker nothing. Two is
 * the first count where the grouping carries information.
 */
export const STATE_LAYER_MIN_SUBDIVISIONS = 2

/**
 * How many cities a batch must yield before a state layer is proposed.
 *
 * Below this a flat list of cities under the country is the shorter path, and
 * the Atlas tree is already mixed that way on purpose — France has no state
 * layer. The threshold is about what a visitor has to scan, so it counts cities
 * and not rows: one city with 90 classes is still one line to read.
 */
export const STATE_LAYER_MIN_CITIES = 8

