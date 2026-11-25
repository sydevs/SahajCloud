import slugify from 'slugify'

/**
 * Slugify a value into a URL-safe, lowercased slug, **transliterating** non-Latin
 * scripts (Cyrillic, Greek, …) to ASCII via the `slugify` charmap — where
 * Payload's built-in ASCII-only slugify would collapse them to empty
 * (`Москва → ""`, which then needs disambiguation or fails the slug constraint).
 *
 * The one slugifier in this repo: every {@link slugField}, upload filenames,
 * and the table-of-contents and layout-tab anchors.
 *
 * Umlauts become `ae`/`oe`/`ue` in every language (`Göteborg → "goeteborg"`),
 * the ICAO passport convention. Not `slugify`'s `locale: 'de'`, which also
 * rewrites symbols in every slug (`% → prozent`).
 *
 * Returns `''` for empty/blank input (callers that require a non-empty slug
 * fall back accordingly).
 */
export const slugifyValue = (value: string | null | undefined): string =>
  slugify(
    String(value ?? '')
      // A decomposed `u` + U+0308 would otherwise miss the replacements below.
      .normalize('NFC')
      .replace(/ä/gi, 'ae')
      .replace(/ö/gi, 'oe')
      .replace(/ü/gi, 'ue'),
    { lower: true, strict: true },
  )
