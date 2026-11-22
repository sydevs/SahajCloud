/**
 * Page tag options.
 *
 * Shared across owners — the `pages` collection (the `tags` select options),
 * the configuration globals' Page tags and the richEditor `ContentIndexBlock` —
 * so it lives in `src/lib/` per project-structure rule 4 rather than in the
 * Pages collection folder (which a richEditor block must not reach into
 * cross-owner).
 */

/** The tags a reader filters pages by. Each has an `article.general.tag_*` label. */
export const FACET_PAGE_TAGS = ['wisdom', 'lifestyle', 'creativity', 'event', 'technique']

/**
 * Tags that only place a page in a service (`src/lib/pageServices`), and are
 * never a facet: `subtle-system` puts the chakra and channel pages on the
 * website and in the app.
 *
 * ⚠ WeMeditateWeb's `PAGE_TAG_KEYS` (`lib/content-blocks.ts`) is typed
 * `satisfies Record<PageTag, …>` against the generated `Page['tags']`, so a tag
 * added here must be excluded there.
 */
export const PLACEMENT_PAGE_TAGS = ['subtle-system']

/** Every tag a page can carry. */
export const PAGE_TAGS = [...FACET_PAGE_TAGS, ...PLACEMENT_PAGE_TAGS]

export type PageTag = (typeof PAGE_TAGS)[number]
