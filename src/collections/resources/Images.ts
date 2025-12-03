import type { CollectionConfig } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess } from '@/lib/accessControl'
import { sanitizeFilename } from '@/lib/fieldUtils'

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
            // Generate Cloudflare Images URL if in production with credentials
            if (
              data?.filename &&
              process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH &&
              process.env.NODE_ENV === 'production'
            ) {
              return `https://imagedelivery.net/${process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH}/${data.filename}/public`
            }
            // Fallback to PayloadCMS-generated URL (local storage in development)
            return data?.url
          },
        ],
      },
      admin: {
        hidden: true,
      },
    },
  ],
  hooks: {
    beforeOperation: [sanitizeFilename],
    // Removed: processFile and convertFile (Sharp processing no longer needed)
    afterRead: [trackClientUsageHook],
  },
}
