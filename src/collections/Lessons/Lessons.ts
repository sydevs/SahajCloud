import type { CollectionConfig } from 'payload'

import { mediaField } from '@/fields'
import { removeDanglingLexicalReferencesAfterRead } from '@/hooks/lexicalHooks'
import { fullRichTextEditor } from '@/lib/richEditor'
import { QuoteBlock } from '@/lib/richEditor/blocks'
import { subtitlesJsonSchema, validateSubtitles } from '@/lib/utilities/subtitles'

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
      required: true,
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
              required: true,
              minRows: 1,
              admin: {
                isSortable: true,
                description: 'Story panels to introduce this lesson.',
              },
              defaultValue: [
                {
                  title: '',
                  text: '',
                },
              ],
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
                  name: 'subtitles',
                  type: 'json',
                  label: 'Subtitles',
                  admin: {
                    condition: (_, siblingData) => !!siblingData?.media,
                    description:
                      'Subtitles for video media: [{ startTimeMs, endTimeMs, durationMs?, content }].',
                  },
                  validate: validateSubtitles,
                  typescriptSchema: [() => subtitlesJsonSchema],
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
              name: 'meditationKind',
              type: 'select',
              required: true,
              defaultValue: 'audio',
              options: [
                { label: 'Audio meditation', value: 'audio' },
                { label: 'Video meditation', value: 'video' },
              ],
              admin: {
                custom: {
                  descriptions: {
                    audio:
                      'Plays a guided audio meditation from the Meditations collection.',
                    video:
                      'Plays a video (from the Videos collection) in place of the meditation, preceded by a custom pre-screen.',
                  },
                },
                components: {
                  Field: '@/components/admin/ToggleGroupField',
                  Description: '@/components/admin/SelectDescription',
                },
              },
            },
            {
              name: 'meditation',
              type: 'relationship',
              relationTo: 'meditations',
              localized: true,
              required: false,
              filterOptions: {
                type: { equals: 'lesson' },
              },
              admin: {
                condition: (_, siblingData) =>
                  siblingData?.meditationKind !== 'video',
                description:
                  'Link to a related guided meditation that complements this lesson content.',
              },
            },
            {
              name: 'video',
              type: 'relationship',
              relationTo: 'videos',
              localized: true,
              required: false,
              admin: {
                condition: (_, siblingData) =>
                  siblingData?.meditationKind === 'video',
                description:
                  'Video that plays in place of the meditation. Plays full-screen like technique videos; when it finishes the seeker continues to the Deep Dive.',
              },
            },
            {
              name: 'prescreenLines',
              type: 'array',
              localized: true,
              maxRows: 5,
              label: 'Pre-screen lines',
              labels: { singular: 'Line', plural: 'Lines' },
              admin: {
                condition: (_, siblingData) =>
                  siblingData?.meditationKind === 'video',
                description:
                  'Up to 5 short lines shown one-by-one on the calm pre-video screen (like the meditation start overlay). Keep each line short — it must fit on a single line.',
              },
              fields: [
                {
                  name: 'line',
                  type: 'text',
                  required: true,
                },
              ],
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
            {
              name: 'introSubtitles',
              type: 'json',
              label: 'Intro Subtitles',
              admin: {
                description:
                  'Subtitles for intro audio: [{ startTimeMs, endTimeMs, durationMs?, content }].',
              },
              validate: validateSubtitles,
              typescriptSchema: [() => subtitlesJsonSchema],
            },
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
