import slugify from 'slugify'

/**
 * Umlauts spelled the German way, because `slugify`'s charmap drops the
 * diaeresis (`Universität → universitat`). Its `locale: 'de'` would spell them
 * right but also rewrites symbols in every slug (`& → und`, `% → prozent`), so
 * only these six letters are mapped. `ß → ss` is already in the charmap.
 */
const UMLAUTS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
}

/**
 * Slugify a value into a URL-safe, lowercased slug, **transliterating** non-Latin
 * scripts (Cyrillic, Greek, …) to ASCII via the `slugify` charmap — where
 * Payload's built-in ASCII-only slugify would collapse them to empty
 * (`Москва → ""`, which then needs disambiguation or fails the slug constraint).
 *
 * This is the default `slugify` for every {@link slugField}, so any collection
 * with non-Latin titles/names gets readable slugs (`Москва → "moskva"`).
 *
 * Umlauts become `ae`/`oe`/`ue` in every language (`Universität Trier →
 * "universitaet-trier"`, `Göteborg → "goeteborg"`), the ICAO passport
 * convention. The text is NFC-normalized first, so a `u` followed by a
 * combining diaeresis counts as `ü`.
 *
 * `strict` drops anything that isn't `[a-z0-9-]` after transliteration; `lower`
 * lowercases. Returns `''` for empty/blank input (callers that require a
 * non-empty slug fall back accordingly).
 */
export const slugifyValue = (value: string | null | undefined): string =>
  slugify(
    String(value ?? '')
      .normalize('NFC')
      .replace(/[äöüÄÖÜ]/g, (letter) => UMLAUTS[letter]),
    { lower: true, strict: true },
  )

/**
 * A heading's anchor slug, kept on the pre-umlaut spelling (`ü → u`). The
 * anchor is in links already shared, so it does not follow
 * {@link slugifyValue}'s umlaut rule.
 */
export const slugifyAnchor = (value: string | null | undefined): string =>
  slugify(String(value ?? ''), { lower: true, strict: true })
