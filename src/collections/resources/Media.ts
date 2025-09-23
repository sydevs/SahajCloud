import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { convertFile, processFile, sanitizeFilename } from '@/lib/fieldUtils'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Resources',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'credit', 'tags'],
  },
  access: permissionBasedAccess('media', {
    delete: () => false,
  }),
  upload: {
    staticDir: 'media/media',
    hideRemoveFile: true,
    focalPoint: true,
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    imageSizes: [
      {
        name: 'thumbnail',
        width: 400,
        height: 300,
        position: 'centre',
        formatOptions: {
          format: 'webp',
          options: {
            quality: 95,
          },
        },
      },
      {
        name: 'card',
        width: 768,
        height: 1024,
        position: 'centre',
        formatOptions: {
          format: 'webp',
          options: {
            quality: 95,
          },
        },
      },
      {
        name: 'tablet',
        width: 1024,
        height: undefined, // Maintain aspect ratio
        position: 'centre',
        formatOptions: {
          format: 'webp',
          options: {
            quality: 95,
          },
        },
      },
    ],
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
      name: 'hidden',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
        description: 'Hide from selection in upload fields (e.g., for auto-generated thumbnails)',
        position: 'sidebar',
      },
    },
  ],
  hooks: {
    beforeOperation: [sanitizeFilename],
    beforeValidate: [processFile({})],
    beforeChange: [convertFile],
    afterRead: [trackClientUsageHook],
  },
}
