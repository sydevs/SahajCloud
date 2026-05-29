import type { CollectionConfig } from 'payload'

import { pageBlocks } from '@/blocks/pages'
import { slugField } from '@/fields'
import { APP_REQUIRED_PAGE_FIELDS } from '@/globals/wemeditate-app/config'
import { removeDanglingLexicalReferencesAfterRead } from '@/hooks/lexicalHooks'
import { PAGE_TAGS } from '@/lib/constants'
import { fullRichTextEditor } from '@/lib/richEditor'

export const Pages: CollectionConfig = {
  slug: 'pages',
  defaultPopulate: { appUrl: false },
  trash: true,
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', '_status'],
    livePreview: {
      url: ({ data, locale }) => {
        const baseURL = process.env.WEMEDITATE_WEB_URL
        return `${baseURL}/${locale.code}/preview?collection=pages&id=${data.id}&secret=${process.env.SAHAJCLOUD_PREVIEW_SECRET}`
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
              editor: fullRichTextEditor(pageBlocks),
              hooks: {
                afterRead: [removeDanglingLexicalReferencesAfterRead],
              },
            },
          ],
        },
      ],
    },
    slugField({ useAsSlug: 'title', collectionSlug: 'pages' }),
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
      name: 'featuredVideo',
      type: 'relationship',
      relationTo: 'videos',
      admin: {
        position: 'sidebar',
        description: 'Featured video displayed on this page',
      },
    },
    {
      name: 'tags',
      type: 'select',
      hasMany: true,
      options: PAGE_TAGS,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'webUrl',
      type: 'text',
      virtual: true,
      admin: {
        readOnly: true,
        disableListColumn: true,
        disableListFilter: true,
      },
      hooks: {
        afterRead: [
          ({ data, req }) => {
            const baseURL = process.env.WEMEDITATE_WEB_URL
            if (!baseURL || !data?.slug) return null
            const tag = Array.isArray(data.tags) && data.tags.length > 0 ? data.tags[0] : null
            const locale =
              req.locale && req.locale !== 'en' && req.locale !== 'all' ? req.locale : null
            const parts = [locale, tag, data.slug].filter(Boolean)
            return `${baseURL}/${parts.join('/')}`
          },
        ],
      },
    },
    {
      name: 'appUrl',
      type: 'text',
      virtual: true,
      admin: {
        readOnly: true,
        disableListColumn: true,
        disableListFilter: true,
      },
      hooks: {
        afterRead: [
          async ({ data, req }) => {
            if (!data?.id || !data?.slug) return null

            const ctx = (req?.context ?? {}) as Record<string, unknown>
            const CACHE_KEY = 'appUrlWmConfig'
            let config = ctx[CACHE_KEY] as Record<string, unknown> | undefined
            if (!config) {
              config = (await req.payload.findGlobal({
                slug: 'wm-app-config',
                depth: 0,
                req,
              })) as unknown as Record<string, unknown>
              ctx[CACHE_KEY] = config
              req.context = ctx
            }

            const isAppPage = APP_REQUIRED_PAGE_FIELDS.some((field) => {
              const val = config![field]
              if (val === data.id) return true
              return (
                typeof val === 'object' && val !== null && (val as { id: unknown }).id === data.id
              )
            })

            return isAppPage ? `wemeditate://${data.slug}` : null
          },
        ],
      },
    },
  ],
}
