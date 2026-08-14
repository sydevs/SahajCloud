/**
 * Duration constants for date arithmetic.
 *
 * One day in milliseconds, declared once. Every module doing `Date` maths had
 * been re-deriving `24 * 60 * 60 * 1000` (or an opaque `86400000`) inline, which
 * reads as a magic number at the call site and gives a reviewer nothing to
 * check against.
 *
 * Deliberately a plain millisecond constant rather than a date library: these
 * are *instant* offsets — added to a UTC timestamp and compared with `<=` — so
 * there is no calendar or DST ambiguity to model. Calendar-aware arithmetic
 * (e.g. "same day next month") belongs in the module that needs it, where the
 * month-overflow rule can be stated explicitly; see
 * `src/lib/eventVerification/watermark.ts`.
 */

/** One day, in milliseconds. */
export const DAY_MS = 24 * 60 * 60 * 1000
