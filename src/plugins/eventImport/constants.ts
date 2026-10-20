/** Thresholds the bulk class import turns on. */

/**
 * Hard cap on CSV data rows per import, which bounds the geocoder spend. A
 * region with more classes than this uploads twice.
 */
export const MAX_IMPORT_ROWS = 500

/** Rows the plugin hands our hooks at a time. */
export const IMPORT_BATCH_SIZE = 50

/**
 * Geocodes in flight at once. Mapbox allows 600 requests a minute; four never
 * approaches that, and a lookup is about 200 ms, so a full import takes under a
 * minute.
 */
export const GEOCODE_CONCURRENCY = 4

/**
 * How long an import is kept after its last change, whatever its status. The
 * CSV holds the contact names, addresses and phone numbers a volunteer
 * collected, and a finished import keeps them no more legitimately than a
 * failed one.
 */
export const IMPORT_RETENTION_DAYS = 30

/**
 * How long an import may sit in `pending` before its page opens again. The
 * `default` queue sweeps every five minutes and a 500-row import holds a worker
 * for a few more, so a shorter window would open the page under a healthy run.
 */
export const IMPORT_STALL_MS = 15 * 60 * 1000
