/**
 * The crawlable body, as HTML, for a host that cannot assemble one itself.
 *
 * ⚠ **This is the one place in the atlas SEO surface where we emit markup.**
 * `GET /api/atlas/seo` deliberately sends no HTML at all — the WordPress plugin
 * assembles it from `content.paragraphs` and friends, and its own output never
 * passes through `wp_kses`. A Wix router cannot do that: `getRouterData()` hands
 * its payload to `$w('#…').html`, so the host needs one finished string.
 *
 * So the escaping that lives in `SahajAtlasWordpress/includes/seo.php` lives
 * here instead, and it has to be complete: every value below is operator- or
 * importer-authored CMS text reaching somebody else's document. The structure is
 * a deliberate mirror of `sahaj_atlas_seo_children` and its three renderers, so
 * the two hosts show a crawler the same page — `tests/unit/wix-route-body.spec.ts`
 * pins the element order against that file.
 */

/** Characters that can leave a text node or an attribute value. */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escape a value for a text node **or** an attribute value.
 *
 * One function for both sinks, with both quote characters covered, because the
 * alternative is two functions and a call site that picks the wrong one. `&`
 * goes first, or the escapes would be escaped again.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

/**
 * A URL safe to put in an `href` or `src`, or `null`.
 *
 * `http` and `https` only. A CMS `website` or `onlineUrl` is free text an
 * importer or a region manager typed, so `javascript:alert(1)` is a value this
 * endpoint can really be handed — and unlike every other value here, escaping
 * does not make it safe. WordPress gets this from `esc_url`'s own scheme
 * allowlist; nothing in Wix's `html` sink does.
 */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const url = URL.parse(value)
  if (!url) return null
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
}
