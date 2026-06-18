import type { CollectionConfig } from 'payload'

import { slugField, publicUrlFields } from '@/fields'
import { APP_REQUIRED_PAGE_FIELDS } from '@/globals/WeMeditateAppConfig/WeMeditateAppConfig'
import { PAGE_TAGS } from '@/lib/pageTags'
import { fullRichTextEditor } from '@/lib/richEditor'
import { pageBlocks } from '@/lib/richEditor/blocks'
import { removeDanglingLexicalReferencesAfterRead } from '@/lib/richEditor/lexicalHooks'
import { adminOnlyFieldAccess } from '@/plugins/access'

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
      // Document-level access: managers listed here can read + update this page
      // even without role-based access (see src/plugins/access/documentManagers.ts).
      // Assigning editors is admin-only; editors edit content, not the editor list.
      name: 'managers',
      type: 'relationship',
      relationTo: 'managers',
      hasMany: true,
      label: 'Page Editors',
      access: {
        update: adminOnlyFieldAccess,
      },
      admin: {
        position: 'sidebar',
        description: 'Managers who can edit this page without broader permissions.',
      },
    },
    // Virtual deep links: public web URL + in-app URL (registered app pages
    // only). Both require the page to be published (gate built into
    // publicUrlFields). Web path carries the optional locale + primary tag.
    ...publicUrlFields({
      web: () => (process.env.WEMEDITATE_WEB_URL ? `${process.env.WEMEDITATE_WEB_URL}/` : null),
      app: 'wemeditate://',
      buildPath: ({ platform, data, req }) => {
        const slug = typeof data?.slug === 'string' ? data.slug : null
        if (!slug) return null
        if (platform === 'app') return slug
        const tags = data?.tags
        const tag = Array.isArray(tags) && tags.length > 0 ? (tags[0] as string) : null
        const locale = req.locale && req.locale !== 'en' && req.locale !== 'all' ? req.locale : null
        return [locale, tag, slug].filter(Boolean).join('/')
      },
      // Both links already require published (publicUrlFields' built-in gate).
      // Beyond that, the web link needs no extra condition; the app link is
      // additionally gated to pages registered in the WeMeditate app config.
      exposeWhen: async ({ platform, data, req }) => {
        if (platform === 'web') return true
        const id = data?.id
        if (!id) return false

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

        return APP_REQUIRED_PAGE_FIELDS.some((field) => {
          const val = config![field]
          if (val === id) return true
          return typeof val === 'object' && val !== null && (val as { id: unknown }).id === id
        })
      },
    }),
  ],
}
