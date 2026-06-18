/**
 * Page tag options used for filtering pages.
 *
 * Shared across owners — the `pages` collection (the `tags` select options) and
 * the richEditor `ContentIndexBlock` — so it lives in `src/lib/` per
 * project-structure rule 4 rather than in the Pages collection folder (which a
 * richEditor block must not reach into cross-owner).
 */
export const PAGE_TAGS = ['wisdom', 'lifestyle', 'creativity', 'event', 'technique']

export type PageTag = (typeof PAGE_TAGS)[number]
