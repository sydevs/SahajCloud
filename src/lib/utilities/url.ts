/**
 * Reading a URL out of a string that may not be one.
 *
 * Both callers are admin client code deciding whether to trust a URL the
 * browser handed them — the live-preview iframe's `src`, and a preview target
 * resolved against it — so the opaque-origin rule below is stated once.
 */

/** The parsed URL, or `null` when the value is not one. */
export const parseUrl = (value: null | string | undefined, base?: string | URL): null | URL => {
  if (!value && !base) return null
  try {
    return new URL(value ?? '', base)
  } catch {
    return null
  }
}

/**
 * The origin of a URL string, or `null` when it has none to compare.
 *
 * ⚠ An opaque origin — what a `javascript:`, `data:` or `blob:` URL has —
 * stringifies to the literal `'null'`, so two unrelated ones compare equal.
 * Every caller here is comparing origins to decide whether to trust
 * something, so an opaque one is reported as no origin at all.
 */
export const originOf = (value: null | string | undefined): null | string => {
  const origin = parseUrl(value)?.origin
  return !origin || origin === 'null' ? null : origin
}
