/**
 * Page tag options.
 *
 * Shared across owners — the `pages` collection (the `tags` select options),
 * the configuration globals' Page tags and the richEditor `ContentIndexBlock` —
 * so it lives in `src/lib/` per project-structure rule 4 rather than in the
 * Pages collection folder (which a richEditor block must not reach into
 * cross-owner).
 *
 * ⚠ **The list stays here, not on a configuration.** It is a `select`'s
 * options, so Payload builds the `pages` and `_pages_v` tag enums from it: a
 * value an editor typed into a document could never be one a page may carry.
 * Which of these tags *places* a page is the configuration's to say
 * (`src/lib/pageServices`).
 */

/** The tags a reader filters pages by. Each has an `article.general.tag_*` label. */
export const FACET_PAGE_TAGS = ['wisdom', 'lifestyle', 'creativity', 'event', 'technique']

/**
 * Every tag a page can carry.
 *
 * `subtle-system` — the chakra and channel pages — is the one tag the content
 * index does not offer as a filter, so it has no facet label.
 *
 * ⚠ WeMeditateWeb's `PAGE_TAG_KEYS` (`lib/content-blocks.ts`) is typed
 * `satisfies Record<PageTag, …>` against the generated `Page['tags']`, so a tag
 * added here with no facet label must be excluded there.
 */
export const PAGE_TAGS = [...FACET_PAGE_TAGS, 'subtle-system']

export type PageTag = (typeof PAGE_TAGS)[number]
