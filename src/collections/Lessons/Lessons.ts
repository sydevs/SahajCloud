import type { CollectionConfig } from 'payload'

import { mediaField } from '@/fields'
import { jsonField } from '@/fields/jsonField'
import { fullRichTextEditor } from '@/lib/richEditor'
import { QuoteBlock } from '@/lib/richEditor/blocks'
import { removeDanglingLexicalReferencesAfterRead } from '@/lib/richEditor/lexicalHooks'
import { readFileSubtitles } from '@/lib/transcripts/read'
import { relationId } from '@/lib/utilities/relationId'
import { subtitlesSchema } from '@/lib/utilities/subtitles'
import { virtualFieldInputs } from '@/plugins/virtualFields'

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
                {
                  // A panel video's subtitles are its file's transcript
                  // (#1016), shown under the field and never stored on the step.
                  name: 'mediaTranscript',
                  type: 'ui',
                  admin: {
                    components: {
                      Field: {
                        path: '@/components/admin/TranscriptPanel#FileTranscriptField',
                        clientProps: { fileField: 'media' },
                      },
                    },
                  },
                },
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
              // Not `required`, for the reason `title` is not: see above.
              localized: true,
              // Narrows the picker, and Payload's own `relationship` validator
              // enforces it on save through `validateFilterOptions` — which a
              // custom `validate` here would silently disarm
              // (`src/collections/AGENTS.md`). The transcription keeps its own
              // mime check: the field's upload tab can create a non-audio row
              // before this is validated.
              filterOptions: { mimeType: { equals: 'audio/mpeg' } },
              admin: {
                description:
                  'Audio introduction to this lesson, narrated in the language you are editing. MP3 only. It is transcribed automatically, and the transcript is its subtitles.',
                // A panel video is shown to every language as it is, so only
                // this field warns of a recording in another language.
                components: {
                  beforeInput: ['@/components/admin/TranscriptPanel#RecordingLanguageWarning'],
                },
              },
            },
            {
              // The recording's subtitles are its file's transcript (#1016):
              // shown under the field, corrected on the file, and never stored
              // on the step.
              name: 'introTranscript',
              type: 'ui',
              admin: {
                components: {
                  Field: {
                    path: '@/components/admin/TranscriptPanel#FileTranscriptField',
                    clientProps: { fileField: 'introAudio' },
                  },
                },
              },
            },
            jsonField({
              // shortcut: a read-only copy of the intro file's transcript, for
              // app releases that read this column; remove once every supported
              // release reads `introAudio.subtitles` (#1133).
              name: 'introSubtitles',
              schemaTitle: 'Subtitles',
              schema: subtitlesSchema,
              virtual: true,
              custom: virtualFieldInputs('introAudio'),
              admin: { hidden: true, readOnly: true },
              hooks: {
                afterRead: [
                  // A bare id at any depth (`src/collections/AGENTS.md`), and a
                  // `{ [locale]: id }` map under `locale=all`, which has no one
                  // language to answer for.
                  ({ req, siblingData }) => {
                    const fileId = relationId(siblingData?.introAudio)
                    return fileId ? readFileSubtitles(req, fileId) : null
                  },
                ],
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
