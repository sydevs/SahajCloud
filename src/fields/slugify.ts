/**
 * Slugify a value into a lowercased slug that keeps every letter as written,
 * in any script (`Universität Trier → "universität-trier"`, `София → "софия"`).
 * A URL built from one percent-encodes it (`publicUrlFields`).
 *
 * The one slugifier in this repo: every {@link slugField}, and the
 * table-of-contents and layout-tab anchors. Upload filenames stay ASCII
 * (`src/plugins/storage/filenameUtils.ts`).
 *
 * ⚠ Cross-repo recipe: WeMeditateWeb (`lib/urls/slugify.ts`) and WeMeditateApp
 * (`technique_render_model.dart`) run the same steps, so an anchor or slug
 * derived on either side matches. Change all three together.
 *
 * Returns `''` for input with no letter or digit (callers that require a
 * non-empty slug fall back accordingly).
 */
export const slugifyValue = (value: string | null | undefined): string =>
  String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    // Apostrophes and Armenian in-word marks (Ի՞նչ) sit inside a word, so they
    // are dropped rather than splitting it.
    .replace(/['’ʼ`՛՜՞]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
