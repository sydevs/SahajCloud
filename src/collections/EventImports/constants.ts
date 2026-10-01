/**
 * Thresholds the bulk event import turns on.
 *
 * The resolve, proposal and duplicate steps bring their own as they land: a
 * number arrives with the code that reads it, so a reviewer can check it
 * against behaviour and a wrong value fails something.
 */

/**
 * Hard cap on CSV data rows per batch.
 *
 * Bounds the resolve step's geocoder spend and the commit's write count, both
 * of which are per-row. A region with more classes than this uploads twice.
 */
export const MAX_IMPORT_ROWS = 500

/**
 * How long a trashed batch survives before `PurgeEventImports` hard-deletes it.
 *
 * Long enough that a volunteer who discarded the wrong batch can ask for it
 * back, short enough that an uploaded CSV of contact details is not kept
 * indefinitely for no one's benefit.
 */
export const IMPORT_TRASH_RETENTION_DAYS = 7
