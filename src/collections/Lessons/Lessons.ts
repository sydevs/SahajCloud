import type { CollectionConfig } from 'payload'

import { mediaField } from '@/fields'
import { jsonField } from '@/fields/jsonField'
import { fullRichTextEditor } from '@/lib/richEditor'
import { QuoteBlock } from '@/lib/richEditor/blocks'
import { removeDanglingLexicalReferencesAfterRead } from '@/lib/richEditor/lexicalHooks'
import { subtitlesSchema } from '@/lib/utilities/subtitles'

export const Lessons: CollectionConfig = {
  slug: 'lessons',
  trash: true,
  defaultSort: ['unit', 'step'],
  labels: {
    singular: 'Path Step',
    plural: 'Path Steps',
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'step', 'icon'],
    groupBy: true,
    listSearchableFields: ['title'],
  },
  // versions: {
  //   maxPerDoc: 20,
  //   drafts: true,
  // },
  fields: [
    {
      name: 'title',
      type: 'text',
      // Not `required`: Payload validates a required localized field against
      // that locale's OWN value, so it refuses every write in a locale with no
      // title of its own (#977). Launch Readiness reports a blank one.
      localized: true,
    },
    // ===== INTRODUCTION ===== //
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Intro',
          fields: [
            {
              name: 'panels',
              type: 'array',
              // Localized as an array, so one language's translator cannot delete
              // or reorder another's panels (#977). And deliberately without
              // `required`, `minRows` or a default row: each one makes a write in
              // a second locale store a blank list, hiding the panels that locale
              // falls back to.
              localized: true,
              admin: {
                isSortable: true,
                description: 'Story panels to introduce this lesson.',
              },
              fields: [
                {
                  name: 'title',
                  type: 'text',
                },
                {
                  name: 'text',
                  type: 'textarea',
                },
                {
                  name: 'media',
                  type: 'upload',
                  relationTo: 'files',
                  admin: {
                    description: 'Image or video for this panel.',
                  },
                },
                jsonField({
                  name: 'subtitles',
                  label: 'Subtitles',
                  schemaTitle: 'Subtitles',
                  schema: subtitlesSchema,
                  admin: {
                    condition: (_, siblingData) => !!siblingData?.media,
                    description:
                      'Subtitles for video media: [{ startTimeMs, endTimeMs, durationMs?, content }].',
                  },
                }),
              ],
            },
          ],
        },
        // ===== MEDITATION ===== //
        {
          label: 'Meditation',
          fields: [
            {
              name: 'meditation',
              type: 'relationship',
              relationTo: ['meditations', 'videos', 'lectures'],
              localized: true,
              required: false,
              // Scope the type='lesson' filter to meditations only; videos are
              // unfiltered. Function form returns `true` (not `{}`) for the
              // unfiltered branch — see src/collections/AGENTS.md.
              filterOptions: ({ relationTo }) =>
                relationTo === 'meditations' ? { type: { equals: 'lesson' } } : true,
              admin: {
                description:
                  'Link to a related guided meditation or video that complements this lesson content.',
              },
            },
            {
              name: 'preMeditationLines',
              type: 'textarea',
              localized: true,
              // Nullable by default — an unset value is null ("not overridden",
              // so the app falls back to the pre_meditation_lines translation).
              // We intentionally omit `defaultValue: null`: Payload renders it as
              // a SQL `DEFAULT 'null'` (the literal string), which would taint
              // existing rows on backfill rather than leaving them SQL NULL.
              admin: {
                placeholder: 'find a quiet place\ntake a breath',
                description:
                  'Overrides the default pre-meditation lines for this step. Leave blank to use the translation default.',
              },
            },
            {
              name: 'introAudio',
              type: 'upload',
              relationTo: 'files',
              label: 'Intro Audio',
              admin: {
                description: 'Audio introduction to this lesson.',
              },
            },
            jsonField({
              name: 'introSubtitles',
              label: 'Intro Subtitles',
              schemaTitle: 'Subtitles',
              schema: subtitlesSchema,
              admin: {
                description:
                  'Subtitles for intro audio: [{ startTimeMs, endTimeMs, durationMs?, content }].',
              },
            }),
          ],
        },
        // ===== DEEP DIVE ===== //
        {
          label: 'Deep Dive',
          fields: [
            {
              name: 'article',
              type: 'richText',
              localized: true,
              editor: fullRichTextEditor([QuoteBlock]),
              hooks: {
                afterRead: [removeDanglingLexicalReferencesAfterRead],
              },
            },
          ],
        },
        // ===== APPEARANCE ===== //
        {
          label: 'Appearance',
          fields: [
            {
              name: 'unit',
              type: 'select',
              required: true,
              options: Array.from({ length: 7 }, (_, i) => `Unit ${i + 1}`),
            },
            {
              name: 'step',
              type: 'number',
              required: true,
              admin: {
                description: 'This will determine the order of the path steps',
              },
            },
            mediaField({
              name: 'icon',
              required: true,
            }),
          ],
        },
      ],
    },
  ],
}
