import type { CollectionConfig } from 'payload'

import {
  TextBoxBlock,
  LayoutBlock,
  GalleryBlock,
  CatalogBlock,
  ButtonBlock,
  QuoteBlock,
  MeditationIndexBlock,
  PageIndexBlock,
  MusicIndexBlock,
  SubtleSystemBlock,
  SplashBlock,
} from '@/blocks/pages'
import { slugField } from '@/fields'
import { serverEnv } from '@/lib/env'
import { fullRichTextEditor } from '@/lib/richEditor'

export const Pages: CollectionConfig = {
  slug: 'pages',
  trash: true,
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', '_status'],
    livePreview: {
      url: ({ data, locale }) => {
        const baseURL = serverEnv.WEMEDITATE_WEB_URL
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
                MeditationIndexBlock,
                PageIndexBlock,
                MusicIndexBlock,
                SubtleSystemBlock,
                SplashBlock,
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
      type: 'select',
      hasMany: true,
      options: ['wisdom', 'lifestyle', 'creativity', 'event', 'technique'],
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
