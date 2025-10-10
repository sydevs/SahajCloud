import type { CollectionConfig } from 'payload'
import type { JSONSchema4 } from 'json-schema'
import { permissionBasedAccess, createFieldAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { fullRichTextEditor } from '@/lib/richEditor'
import { QuoteBlock } from '@/blocks/pages'
import subtitleSchema from '@/lib/subtitlesSchema.json'
import { TextStoryBlock, VideoStoryBlock, CoverStoryBlock } from '@/blocks/lessons'
import { FileAttachmentField } from '@/fields'
import {
  deleteFileAttachmentsHook,
  claimOrphanFileAttachmentsHook,
} from '@/fields/FileAttachmentField'

export const Lessons: CollectionConfig = {
  slug: 'lessons',
  access: permissionBasedAccess('lessons'),
  trash: true,
  defaultSort: ['unit', 'step'],
  labels: {
    singular: 'Path Step',
    plural: 'Path Steps',
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'step'],
    groupBy: true,
    listSearchableFields: ['title'],
  },
  versions: {
    maxPerDoc: 50,
    drafts: true,
  },
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
              type: 'blocks',
              required: true,
              minRows: 2,
              admin: {
                isSortable: true,
                description:
                  'Story panels to introduce this lesson. First panel must be a Cover Panel.',
              },
              blocks: [CoverStoryBlock, VideoStoryBlock, TextStoryBlock],
              defaultValue: [
                {
                  blockType: 'cover',
                  title: '',
                  quote: '',
                },
                {
                  blockType: 'text',
                  title: '',
                  text: '',
                },
              ],
              validate: (value: unknown) => {
                if (!Array.isArray(value) || value.length === 0) {
                  return 'At least one panel is required'
                }
                if (value[0]?.blockType !== 'cover') {
                  return 'First panel must be a Cover Panel'
                }
                return true
              },
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
              relationTo: 'meditations',
              required: false,
              admin: {
                description:
                  'Link to a related guided meditation that complements this lesson content.',
              },
            },
            FileAttachmentField({
              name: 'introAudio',
              label: 'Intro Audio',
              ownerCollection: 'lessons',
              fileType: 'audio',
              admin: {
                description:
                  'Link to a related guided meditation that complements this lesson content.',
              },
            }),
            {
              name: 'introSubtitles',
              type: 'json',
              label: 'Intro Subtitles',
              jsonSchema: {
                uri: 'a://b/foo.json', // required
                fileMatch: ['a://b/foo.json'], // required
                schema: subtitleSchema as JSONSchema4,
              },
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
              options: Array.from({ length: 4 }, (_, i) => `Unit ${i + 1}`),
              access: createFieldAccess('lessons', false),
            },
            {
              name: 'step',
              type: 'number',
              required: true,
              admin: {
                description: 'This will determine the order of the path steps',
              },
              access: createFieldAccess('lessons', false),
            },
            FileAttachmentField({
              name: 'icon',
              ownerCollection: 'lessons',
              fileType: 'image',
              access: createFieldAccess('lessons', false),
            }),
          ],
        },
      ],
    },
  ],
  hooks: {
    afterRead: [trackClientUsageHook],
    afterChange: [claimOrphanFileAttachmentsHook],
    afterDelete: [deleteFileAttachmentsHook],
  },
}
