/**
 * What a Wix router prefix may be — one rule, read by three places.
 *
 * ⚠ **The tab's whole value is telling a volunteer the answer before they
 * publish, so "accepted by the tab, refused by the endpoint" must be
 * unreachable.** It was reachable while the pattern was declared three times:
 * in the Install tab's templates, in the `GET /api/atlas/wix/sitemap` query
 * schema, and again as a string in the OpenAPI shim, each asserting in prose
 * that the others applied "the identical rule".
 *
 * Lives here, in `src/lib/atlas/` beside `canonicalUrl.ts`, because its
 * consumers span an endpoint, an admin component and the OpenAPI shim — and
 * because it has to stay importable from a `'use client'` module. **It imports
 * nothing**, deliberately: the endpoint folder would have been the natural home
 * for a contract, but `wixRoute.ts` there reaches `verifyEmbed` →
 * `browserRendering` → `@/lib/env/server`, and the admin bundle must not carry
 * that (`tests/unit/client-bundle-safety.spec.ts`, #633).
 */

/**
 * One lowercase path segment: the set Wix accepts for a dynamic page slug.
 *
 * Hyphens are allowed between runs and nowhere else, so neither `-classes` nor
 * `classes-` passes. Exported as the source the OpenAPI shim publishes, so the
 * documented pattern cannot differ from the enforced one.
 */
export const WIX_PREFIX_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Longest prefix accepted, since it is spliced into every sitemap entry's URL. */
export const WIX_PREFIX_MAX_LENGTH = 64

/** Is this a prefix both Wix and `GET /api/atlas/wix/sitemap` will take? */
export function isValidWixPrefix(prefix: string): boolean {
  return (
    prefix.length > 0 && prefix.length <= WIX_PREFIX_MAX_LENGTH && WIX_PREFIX_PATTERN.test(prefix)
  )
}
