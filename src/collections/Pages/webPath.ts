/**
 * The one place a page's public path is composed.
 *
 * Two callers need the same answer and must never drift:
 *
 * - `publicUrlFields`, which publishes it as `webPath` / `webUrl`, and
 * - `admin.livePreview.url`, which points the preview panel at it.
 *
 * When those two disagree the panel lands on a 404 while the published URL
 * looks fine, or the reverse — both silent. They disagreed once already: a tag
 * segment was emitted here that no site has ever served.
 *
 * ⚠ **The locale is a parameter, not read from `req`.** `publicUrlFields`
 * passes `req.locale`; `livePreview.url` receives its own `locale.code` and
 * must pass that. They are not reliably the same value, and a builder that
 * reached for `req.locale` itself would silently render English in the panel.
 */

/** Locales that take no path prefix: the default, and the all-locales read. */
const UNPREFIXED = new Set(['en', 'all'])

export function buildPageWebPath(opts: {
  slug: unknown
  locale: string | null | undefined
}): string | null {
  const slug = typeof opts.slug === 'string' && opts.slug.length > 0 ? opts.slug : null
  if (!slug) return null

  const prefix = opts.locale && !UNPREFIXED.has(opts.locale) ? opts.locale : null

  return [prefix, slug].filter(Boolean).join('/')
}
