import type { CollectionConfig } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess } from '@/lib/accessControl'
import { createVirtualUrlField } from '@/lib/storage/urlFields'

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
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'],
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
      relationTo: 'image-tags',
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
    createVirtualUrlField({
      collection: 'images',
      adapter: 'cloudflare-images',
    }),
  ],
  hooks: {
    // Removed: sanitizeFilename (not needed - Cloudflare provides unique IDs)
    // Removed: processFile and convertFile (Sharp processing no longer needed)
    afterRead: [trackClientUsageHook],
  },
}
