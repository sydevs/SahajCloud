/**
 * JSON-LD for an atlas route — serialized once, here, in a form that is safe to
 * drop into a `<script type="application/ld+json">` on somebody else's page.
 *
 * **Why the escaping lives here and not in each consumer.** The string this
 * module returns is echoed into a WordPress template and into a Vike SSR
 * response, neither of which sanitizes it: C5's plugin markup deliberately does
 * not pass through `wp_kses`. An HTML parser inside a `<script>` element ends
 * the element at the first `</script`, and treats `<!--` as the start of a
 * comment — so a CMS-authored event title containing either would break out of
 * the script and into the host's document. Escaping it in three consumers is
 * three chances to forget; escaping it in the producer is one place that is
 * either right or loudly wrong.
 *
 * The equivalent sink in the widget is inert only by accident — helmet writes it
 * via `innerHTML` on a *detached* script element, which never parses as markup
 * (sydevs/SahajAtlasWeb `.claude/reports/101-update-deps.md`). Nothing protects
 * a `<?php echo ?>`.
 */

/** U+2028 LINE SEPARATOR, named because it is invisible in an editor. */
const LINE_SEPARATOR = ' '
/** U+2029 PARAGRAPH SEPARATOR, likewise. */
const PARAGRAPH_SEPARATOR = ' '

/**
 * Serialize a value as JSON that cannot terminate or comment out the `<script>`
 * element it is embedded in.
 *
 * `<`, `>` and `&` become `<` / `>` / `&`. Escaping `<` alone
 * would be enough for both `</script` and `<!--`, but all three go because the
 * set is what a reader can check at a glance, and because `&` closes off the
 * `&lt;`-decoding paths some template layers add on top.
 *
 * The two Unicode separators are escaped as well: JSON permits them raw inside
 * a string while ECMAScript once treated them as line terminators, so a
 * consumer that inlines this block into a script rather than parsing it as data
 * stays safe too.
 *
 * Every replacement is a **valid JSON escape for the same character**, so the
 * output still parses to a value deep-equal to the input — this is an encoding
 * change, never a content change. `JSON.stringify` returning `undefined` (for a
 * bare `undefined` input) collapses to `"null"` so the return type holds.
 */
export function jsonLdEscape(value: unknown): string {
  return (JSON.stringify(value) ?? 'null')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(LINE_SEPARATOR)
    .join('\\u2028')
    .split(PARAGRAPH_SEPARATOR)
    .join('\\u2029')
}

/** A schema.org node. Loose by design — the shapes built below are the contract. */
export type JsonLdNode = Record<string, unknown>

/**
 * Drop `undefined`, `null`, `''` and empty arrays from a node.
 *
 * Structured-data validators warn on an empty property, and half the fields
 * here are genuinely optional on an Atlas record (a venue with no post code, an
 * event with no description). Omitting is the correct expression of "we don't
 * know this"; an empty string is a claim that it is blank.
 */
export function compactNode(node: JsonLdNode): JsonLdNode {
  const out: JsonLdNode = {}
  for (const [key, value] of Object.entries(node)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  return out
}

/** One rung of a breadcrumb trail: a name and the canonical URL it points at. */
export interface BreadcrumbRung {
  name: string
  url: string | null
}

/**
 * A schema.org `BreadcrumbList` over a region ancestry, or `null` when there is
 * nothing to describe — fewer than two rungs is a trail of one page, which says
 * nothing a crawler doesn't already know.
 *
 * `item` is omitted on a rung whose canonical could not be resolved, which is
 * the shape Google documents for an unlinkable element — better than pointing
 * it at a URL we refused to publish.
 */
export function breadcrumbList(rungs: readonly BreadcrumbRung[]): JsonLdNode | null {
  if (rungs.length < 2) return null
  return {
    '@type': 'BreadcrumbList',
    itemListElement: rungs.map((rung, index) =>
      compactNode({
        '@type': 'ListItem',
        position: index + 1,
        name: rung.name,
        item: rung.url ?? undefined,
      }),
    ),
  }
}

/**
 * Wrap nodes into the single `@context`-bearing document a consumer embeds.
 *
 * Always a `@graph`, even for one node: a consumer sees one shape whatever the
 * route resolved to, and adding a second node later doesn't change the envelope.
 */
export function jsonLdGraph(nodes: readonly (JsonLdNode | null)[]): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes.filter((node): node is JsonLdNode => node !== null),
  }
}
