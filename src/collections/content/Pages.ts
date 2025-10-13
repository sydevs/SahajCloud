import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { fullRichTextEditor } from '@/lib/richEditor'
import { TextBoxBlock, LayoutBlock, GalleryBlock, ButtonBlock, QuoteBlock } from '@/blocks/pages'
import { SlugField } from '@nouance/payload-better-fields-plugin/Slug'

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: permissionBasedAccess('pages'),
  trash: true,
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'publishAt'],
  },
  versions: {
    maxPerDoc: 50,
    drafts: true,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
              localized: true,
            },
            {
              name: 'content',
              type: 'richText',
              localized: true,
              editor: fullRichTextEditor([
                TextBoxBlock,
                LayoutBlock,
                GalleryBlock,
                ButtonBlock,
                QuoteBlock,
              ]),
            },
          ],
        },
      ],
    },
    ...SlugField('title', {
      slugOverrides: {
        unique: true,
        admin: {
          position: 'sidebar',
        },
      },
    }),
    {
      name: 'publishAt',
      type: 'date',
      localized: true,
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayOnly',
          minDate: new Date(),
        },
        components: {
          Cell: '@/components/admin/PublishStateCell',
          afterInput: ['@/components/admin/PublishAtAfterInput'],
        },
      },
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        {
          label: 'Technique',
          value: 'technique',
        },
        {
          label: 'Artwork',
          value: 'artwork',
        },
        {
          label: 'Event',
          value: 'event',
        },
        {
          label: 'Knowledge',
          value: 'knowledge',
        },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'page-tags',
      hasMany: true,
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
