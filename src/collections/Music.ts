import type { CollectionConfig } from 'payload'
import { getStorageConfig } from '@/lib/storage'

export const Music: CollectionConfig = {
  slug: 'music',
  upload: {
    staticDir: 'media/music',
    mimeTypes: ['audio/*'],
    imageSizes: [], // Disable image processing for audio files
    ...getStorageConfig(), // Apply production-aware storage configuration
  },
  admin: {
    useAsTitle: 'title',
  },
  hooks: {
    beforeChange: [
      ({ data, operation, originalDoc }) => {
        // Generate slug from title
        if (operation === 'create' && data.title) {
          data.slug = data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        } else if (operation === 'update' && originalDoc) {
          data.slug = originalDoc.slug
        }

        // TODO: Add file size and duration validation
        // For now, relying on Payload's built-in mimeType validation

        // TODO: Extract and validate audio duration
        // For now, this would require audio metadata extraction
        // which needs additional libraries like node-ffprobe or similar

        return data
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'duration',
      type: 'number',
      admin: {
        description: 'Duration in minutes (auto-populated)',
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
    },
    {
      name: 'credit',
      type: 'text',
      admin: {
        description: 'Attribution or credit information',
      },
    },
  ],
}