import type { CollectionConfig } from 'payload'

import { detectOrientationHook } from '@/hooks/imageHooks'
import { virtualUrlField } from '@/lib/storage/urlFields'

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
  trash: true,
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
      type: 'select',
      hasMany: true,
      options: [
        'landscape',
        'portrait',
        'square',
        'thumbnail',
        'author',
        'icon',
        'stock-photo',
        'technique',
        'meditation',
        'placeholder',
        'lesson',
      ],
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
    virtualUrlField({
      collection: 'images',
      adapter: 'cloudflare-images',
    }),
  ],
  hooks: {
    // Removed: sanitizeFilename (not needed - Cloudflare provides unique IDs)
    // Removed: processFile and convertFile (Sharp processing no longer needed)
    beforeChange: [detectOrientationHook],
  },
}
