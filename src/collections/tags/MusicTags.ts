import type { CollectionConfig } from 'payload'

import { SlugField } from '@nouance/payload-better-fields-plugin/Slug'

import { roleBasedAccess } from '@/lib/accessControl'

export const MusicTags: CollectionConfig = {
  slug: 'music-tags',
  access: roleBasedAccess('music'),
  admin: {
    group: 'Tags',
    useAsTitle: 'title',
    hidden: true,
  },
  upload: {
    staticDir: 'media/music-tags',
    hideRemoveFile: true,
    mimeTypes: ['image/svg+xml'],
  },
  fields: [
    // Virtual URL field for CDN delivery
    {
      name: 'url',
      type: 'text',
      virtual: true,
      hooks: {
        afterRead: [
          ({ data }) => {
            if (!data?.filename) return undefined

            // Generate Cloudflare Images URL if in production with credentials
            const deliveryUrl = process.env.CLOUDFLARE_IMAGES_DELIVERY_URL
            if (deliveryUrl) {
              return `${deliveryUrl}/${data.filename}/public`
            }

            // Fallback to PayloadCMS static file serving in development
            return `/api/music-tags/file/${data.filename}`
          },
        ],
      },
      admin: { hidden: true },
    },
    // Slug auto-generated from title
    ...SlugField('title', {
      slugOverrides: {
        unique: true,
        admin: {
          position: 'sidebar',
          description: 'URL-friendly identifier (auto-generated from title)',
        },
      },
    }),
    // Title (localized, for public display)
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: 'Localized title shown to public users',
      },
    },
    // Bidirectional join to music
    {
      name: 'music',
      type: 'join',
      collection: 'music',
      on: 'tags',
    },
  ],
}
