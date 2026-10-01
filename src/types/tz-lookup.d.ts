/**
 * `tz-lookup` ships no types and has no `@types` package.
 *
 * ⚠ **It throws rather than returning null.** `RangeError('invalid
 * coordinates')` is its answer for a point outside range, so a caller handing
 * it numbers parsed from a CSV must catch — the import's own
 * `deriveImportTimezone` does.
 */
declare module 'tz-lookup' {
  /** The IANA zone covering a point. Never null, and never an offset. */
  export default function tzlookup(latitude: number, longitude: number): string
}
