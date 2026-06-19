import slugify from 'slugify'

/**
 * Slugify a value into a URL-safe, lowercased slug, **transliterating** non-Latin
 * scripts (Cyrillic, Greek, …) to ASCII via the `slugify` charmap — where
 * Payload's built-in ASCII-only slugify would collapse them to empty
 * (`Москва → ""`, which then needs disambiguation or fails the slug constraint).
 *
 * This is the default `slugify` for every {@link slugField}, so any collection
 * with non-Latin titles/names gets readable slugs (`Москва → "moskva"`). Seed
 * importers reuse it so seeded and admin-generated slugs agree.
 *
 * `strict` drops anything that isn't `[a-z0-9-]` after transliteration; `lower`
 * lowercases. Returns `''` for empty/blank input (callers that require a
 * non-empty slug fall back accordingly).
 */
export const slugifyValue = (value: string | null | undefined): string =>
  slugify(String(value ?? ''), { lower: true, strict: true })
