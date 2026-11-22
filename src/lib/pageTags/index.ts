/**
 * Page tag options used for filtering pages.
 *
 * Shared across owners — the `pages` collection (the `tags` select options) and
 * the richEditor `ContentIndexBlock` — so it lives in `src/lib/` per
 * project-structure rule 4 rather than in the Pages collection folder (which a
 * richEditor block must not reach into cross-owner).
 *
 * A tag also places its pages in a service: each configuration global lists
 * the tags whose pages it takes (`src/lib/pageServices`).
 */
export const PAGE_TAGS = [
  'wisdom',
  'lifestyle',
  'creativity',
  'event',
  'technique',
  'subtle-system',
]

export type PageTag = (typeof PAGE_TAGS)[number]

/**
 * Tags that only place a page, and are never a facet a reader filters by — so
 * they carry no `article.general.tag_*` label. `subtle-system` exists so the
 * chakra and channel pages reach both services.
 *
 * ⚠ WeMeditateWeb's `PAGE_TAG_KEYS` (`lib/content-blocks.ts`) is typed
 * `satisfies Record<PageTag, …>`, so a tag added here must be excluded there.
 */
export const PLACEMENT_ONLY_PAGE_TAGS: readonly PageTag[] = ['subtle-system']
