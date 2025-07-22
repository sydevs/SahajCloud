import type { CollectionConfig } from 'payload'
import { getAudioDuration, validateAudioDuration, validateAudioFileSize } from '@/lib/audioUtils'
import { getStorageConfig } from '@/lib/storage'

export const Music: CollectionConfig = {
  slug: 'music',
  upload: {
    staticDir: 'media/music',
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg'],
    ...getStorageConfig(),
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

        return data
      },
      async ({ data, req }) => {
        // Audio file validation and duration extraction
        if (req.file && req.file.data) {
          try {
            // Validate file size (50MB limit)
            const fileSizeValidation = validateAudioFileSize(req.file.size || 0, 50)
            if (fileSizeValidation !== true) {
              throw new Error(fileSizeValidation)
            }

            // Extract and validate audio duration
            const duration = await getAudioDuration(req.file.data)
            const durationValidation = validateAudioDuration(duration, 15) // 15 minutes max
            if (durationValidation !== true) {
              throw new Error(durationValidation)
            }

            // Auto-populate duration in minutes
            data.duration = Math.round(duration) // Round to nearest second
          } catch (error) {
            req.payload.logger.error({
              msg: 'Music file validation failed',
              err: error,
              fileName: req.file.name,
              fileSize: req.file.size,
            })
            throw error
          }
        }
        
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
        description: 'Duration in seconds',
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