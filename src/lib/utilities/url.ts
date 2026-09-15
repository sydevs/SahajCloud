/**
 * Reading an origin out of a string that may not be a URL.
 *
 * Parsing itself is `URL.parse` — the built-in that returns `null` instead of
 * throwing (Node 22, and every browser the admin supports). Only the rule
 * below is ours, and both callers are admin client code deciding whether to
 * trust a URL the browser handed them — the live-preview iframe's `src`, and a
 * preview target resolved against it — so it is stated once.
 */

/**
 * The origin of a URL string, or `null` when it has none to compare.
 *
 * ⚠ An opaque origin — what a `javascript:`, `data:` or `blob:` URL has —
 * stringifies to the literal `'null'`, so two unrelated ones compare equal.
 * Every caller here is comparing origins to decide whether to trust
 * something, so an opaque one is reported as no origin at all.
 */
export const originOf = (value: null | string | undefined): null | string => {
  const origin = URL.parse(value ?? '')?.origin
  return !origin || origin === 'null' ? null : origin
}
