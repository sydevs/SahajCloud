import type { CollectionConfig } from 'payload'

import { restrictUploadToAdmin } from '@/plugins/access'
import { virtualUrlField } from '@/plugins/storage/urlFields'

import { detectOrientationHook } from './hooks/detectOrientationHook'

export const Images: CollectionConfig = {
  slug: 'images',
  labels: {
    singular: 'Image',
    plural: 'Images',
  },
  admin: {
    group: 'Media',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'credit', 'tags'],
  },
  trash: true,
  disableDuplicate: true,
  upload: {
    staticDir: 'media/images',
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
        'app-card',
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
    virtualUrlField({ collection: 'images', adapter: 'cloudflare-images' }),
  ],
  hooks: {
    // Removed: sanitizeFilename (not needed - Cloudflare provides unique IDs)
    // Removed: processFile and convertFile (Sharp processing no longer needed)
    beforeChange: [restrictUploadToAdmin({ label: 'image' }), detectOrientationHook],
  },
}
