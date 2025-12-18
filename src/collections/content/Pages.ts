import type { CollectionConfig } from 'payload'

import {
  TextBoxBlock,
  LayoutBlock,
  GalleryBlock,
  CatalogBlock,
  ButtonBlock,
  QuoteBlock,
} from '@/blocks/pages'
import { slugField } from '@/fields'
import { roleBasedAccess } from '@/lib/access'
import { handleProjectVisibility } from '@/lib/projectVisibility'
import { fullRichTextEditor } from '@/lib/richEditor'

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: roleBasedAccess('pages'),
  trash: true,
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', '_status'],
    hidden: handleProjectVisibility('pages', ['wemeditate-web']),
    livePreview: {
      url: ({ data, locale }) => {
        const baseURL = process.env.WEMEDITATE_WEB_URL || 'http://localhost:5173'
        return `${baseURL}/${locale.code}/preview?collection=pages&id=${data.id}`
      },
    },
  },
  versions: {
    maxPerDoc: 3,
    drafts: {
      autosave: {
        interval: 60000, // 60 seconds
      },
      schedulePublish: true,
    },
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
                CatalogBlock,
                ButtonBlock,
                QuoteBlock,
              ]),
            },
          ],
        },
      ],
    },
    slugField({ useAsSlug: 'title' }),
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      admin: {
        position: 'sidebar',
        description: 'Article author (for article pages)',
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
