import type { CollectionConfig } from 'payload'
import type { JSONSchema4 } from 'json-schema'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { fullRichTextEditor } from '@/lib/richEditor'
import { QuoteBlock } from '@/blocks/pages'
import subtitleSchema from '@/lib/subtitlesSchema.json'
import { TextStoryBlock, VideoStoryBlock } from '@/blocks/lessons'
import { FileAttachmentField } from '@/fields'
import {
  deleteFileAttachmentsHook,
  claimOrphanFileAttachmentsHook,
} from '@/fields/FileAttachmentField'

export const Lessons: CollectionConfig = {
  slug: 'lessons',
  access: permissionBasedAccess('lessons'),
  trash: true,
  admin: {
    hidden: true,
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'unit', 'order', 'publishAt'],
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
              name: 'shriMatajiQuote',
              type: 'textarea',
              required: true,
            },
            {
              name: 'panels',
              type: 'blocks',
              required: true,
              minRows: 1,
              admin: {
                isSortable: true,
                description: 'Story panels to introduce this lesson.',
              },
              blocks: [VideoStoryBlock, TextStoryBlock],
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
              required: true,
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
      ],
    },
  ],
  hooks: {
    afterRead: [trackClientUsageHook],
    afterChange: [claimOrphanFileAttachmentsHook],
    afterDelete: [deleteFileAttachmentsHook],
  },
}
