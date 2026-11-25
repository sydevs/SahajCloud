import slugify from 'slugify'

/**
 * An anchor slug, kept on the library's own spelling (`ü → u`): the
 * table-of-contents headings and the layout block's tab anchors. Shared links
 * point at them, and each block matches a stored anchor against a freshly
 * derived one (`TableOfContentsField/headings.ts`, `LayoutBlock.ts`'s
 * `defaultTab`), so they must not follow {@link slugifyValue}'s umlaut rule.
 */
export const slugifyAnchor = (value: string | null | undefined): string =>
  slugify(String(value ?? ''), { lower: true, strict: true })

/**
 * Slugify a value into a URL-safe, lowercased slug, **transliterating** non-Latin
 * scripts (Cyrillic, Greek, …) to ASCII via the `slugify` charmap — where
 * Payload's built-in ASCII-only slugify would collapse them to empty
 * (`Москва → ""`, which then needs disambiguation or fails the slug constraint).
 *
 * This is the default `slugify` for every {@link slugField}, so any collection
 * with non-Latin titles/names gets readable slugs (`Москва → "moskva"`).
 *
 * Umlauts become `ae`/`oe`/`ue` in every language (`Göteborg → "goeteborg"`),
 * the ICAO passport convention. Not `slugify`'s `locale: 'de'`, which also
 * rewrites symbols in every slug (`% → prozent`).
 *
 * Returns `''` for empty/blank input (callers that require a non-empty slug
 * fall back accordingly).
 */
export const slugifyValue = (value: string | null | undefined): string =>
  slugifyAnchor(
    String(value ?? '')
      // A decomposed `u` + U+0308 would otherwise miss the replacements below.
      .normalize('NFC')
      .replace(/ä/gi, 'ae')
      .replace(/ö/gi, 'oe')
      .replace(/ü/gi, 'ue'),
  )
