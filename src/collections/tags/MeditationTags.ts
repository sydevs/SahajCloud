import type { CollectionConfig } from 'payload'

import { SlugField } from '@nouance/payload-better-fields-plugin/Slug'

import { ColorField } from '@/fields/ColorField'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess } from '@/lib/accessControl'

export const MeditationTags: CollectionConfig = {
  slug: 'meditation-tags',
  access: roleBasedAccess('meditations'),
  admin: {
    group: 'Tags',
    useAsTitle: 'title',
    hidden: true,
  },
  upload: {
    staticDir: 'media/meditation-tags',
    hideRemoveFile: true,
    mimeTypes: ['image/svg+xml'],
  },
  hooks: {
    afterRead: [trackClientUsageHook],
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
            return `/api/meditation-tags/file/${data.filename}`
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
    // Color picker (hex format)
    ...ColorField({
      name: 'color',
      label: 'Color',
      required: true,
      admin: {
        description: 'Tag color for UI theming (hex format)',
      },
    }),
    // Bidirectional join to meditations
    {
      name: 'meditations',
      type: 'join',
      collection: 'meditations',
      on: 'tags',
    },
  ],
}
