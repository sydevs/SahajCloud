import type { CollectionConfig } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess } from '@/lib/accessControl'

export const Images: CollectionConfig = {
  slug: 'images',
  labels: {
    singular: 'Image',
    plural: 'Images',
  },
  admin: {
    group: 'Resources',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'credit', 'tags'],
  },
  access: roleBasedAccess('images', {
    delete: () => false,
  }),
  disableDuplicate: true,
  upload: {
    staticDir: 'media/images',
    hideRemoveFile: true,
    focalPoint: true,
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    // imageSizes removed - using Cloudflare Images flexible variants instead
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'credit',
      type: 'text',
      localized: true,
      admin: {
        description: 'Attribution or copyright information',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'media-tags',
      hasMany: true,
      admin: {
        description: 'Tags to categorize this image',
      },
    },
    {
      name: 'fileMetadata',
      type: 'json',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
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
              return `${deliveryUrl}/${data.filename}/format=auto,width=320,height=320,fit=cover`
            }

            // Fallback to PayloadCMS static file serving in development
            return `/api/images/file/${data.filename}`
          },
        ],
      },
      admin: {
        hidden: true,
      },
    },
  ],
  hooks: {
    // Removed: sanitizeFilename (not needed - Cloudflare provides unique IDs)
    // Removed: processFile and convertFile (Sharp processing no longer needed)
    afterRead: [trackClientUsageHook],
  },
}
