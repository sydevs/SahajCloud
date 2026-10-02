import type { GlobalConfig } from 'payload'

/** A row as the array validator sees it: unknown until proven otherwise. */
type TermRow = { key?: unknown }

/**
 * `key` is the identifier consumers look a term up by, so two rows sharing one
 * makes the lookup ambiguous rather than merely untidy. Payload has no unique
 * constraint inside an array, and it validates the whole stored array on every
 * save, so this is the only place the rule can live.
 */
const validateUniqueKeys = (rows: unknown): string | true => {
  if (!Array.isArray(rows)) return true

  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const row of rows as TermRow[]) {
    const key = typeof row?.key === 'string' ? row.key.trim() : ''
    if (!key) continue
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  }

  if (duplicates.size === 0) return true
  return `Duplicate term key(s): ${[...duplicates].join(', ')}. Each key appears once.`
}

/**
 * Sahaja Yoga terminology — one row per term, carrying that term's spelling in
 * each locale. Speech-to-text misspells these words and translators render
 * them inconsistently, so the transcription prompt and the translation checks
 * read one list instead of each carrying its own copy.
 *
 * ⚠ **Hidden from every admin menu, admins included**, and named in no project
 * in `src/plugins/access/config/projects.ts`. Both are load-bearing, and the
 * second cuts the opposite way to how it reads: a global in no project counts
 * as *shared*, which `hasPermission` step 4a treats as implicitly readable by
 * every role. So the slug is in `RESTRICTED_COLLECTIONS` as well, and only the
 * admin bypass or a server-side `overrideAccess` read reaches it.
 *
 * While it stays hidden, `seeds/sahaja-glossary/data.json` is the source of
 * truth: a change goes into the file and a re-seed carries it. Letting
 * translators edit their own language here means dropping `admin.hidden` and
 * granting `translate`.
 */
export const SahajaGlossary: GlobalConfig = {
  slug: 'sahaja-glossary',
  label: 'Sahaja Glossary',
  admin: {
    // `accessPlugin` replaces a global's `hidden` with its project rule. An
    // explicit `true` is the one declaration that survives that pass.
    hidden: true,
  },
  fields: [
    {
      name: 'terms',
      type: 'array',
      labels: { singular: 'Term', plural: 'Terms' },
      validate: validateUniqueKeys,
      fields: [
        {
          name: 'key',
          type: 'text',
          required: true,
          admin: {
            description:
              'The English canonical term, and the identifier consumers look a row up by. Not localized.',
          },
        },
        {
          name: 'category',
          type: 'select',
          required: true,
          options: [
            { label: 'Subtle system', value: 'subtle-system' },
            { label: 'Practice', value: 'practice' },
            { label: 'Phrase', value: 'phrase' },
            { label: 'App', value: 'app' },
          ],
        },
        {
          name: 'keepAsIs',
          type: 'checkbox',
          admin: {
            description:
              'The term is never translated. Consumers use its English spelling in every language.',
          },
        },
        {
          name: 'term',
          type: 'text',
          localized: true,
          admin: {
            description:
              'How the term is written in this language. Empty where the language has no agreed spelling — never filled from English.',
          },
        },
      ],
    },
    {
      name: 'translatorNotes',
      type: 'textarea',
      localized: true,
      admin: {
        description: "This language's tone rules — formal or informal address, and so on.",
      },
    },
  ],
}
