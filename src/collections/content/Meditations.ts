import type { CollectionConfig, Validate } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import {
  buildKeyframeData,
  convertFile,
  generateSlug,
  processFile,
  sanitizeFilename,
} from '@/lib/fieldUtils'
import { KeyframeData, KeyframeDefinition } from '@/components/admin/MeditationFrameEditor/types'

export const Meditations: CollectionConfig = {
  slug: 'meditations',
  access: permissionBasedAccess('meditations'),
  trash: true,
  upload: {
    staticDir: 'media/meditations',
    bulkUpload: false,
    hideRemoveFile: true,
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg'],
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['thumbnail', 'title', 'publishAt', 'duration', 'tags'],
  },
  hooks: {
    beforeOperation: [sanitizeFilename],
    beforeValidate: [processFile({})],
    beforeChange: [generateSlug, convertFile],
    afterRead: [trackClientUsageHook],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'locale',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Czech', value: 'cs' },
      ],
      required: true,
      defaultValue: 'en',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'publishAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayOnly',
          minDate: new Date(),
        },
        components: {
          Cell: '@/components/admin/PublishStateCell',
          afterInput: ['@/components/admin/PublishAtAfterInput'],
        },
      },
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
      name: 'thumbnail',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        components: {
          Cell: {
            path: '@/components/admin/ThumbnailCell#default',
            clientProps: {
              aspectRatio: '16:9',
              size: 'large',
            },
          },
        },
      },
      validate: (async (value, { req }) => {
        if (!value) return true // Required validation handles this

        try {
          const media = await req.payload.findByID({
            collection: 'media',
            id: value,
          })

          if (!media.mimeType || !media.mimeType.startsWith('image/')) {
            return 'Thumbnail must be an image file'
          }

          return true
        } catch (_error) {
          return 'Invalid media file'
        }
      }) as Validate,
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
      name: 'narrator',
      type: 'relationship',
      relationTo: 'narrators',
      required: true,
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'meditation-tags',
      hasMany: true,
    },
    {
      name: 'musicTag',
      type: 'relationship',
      relationTo: 'music-tags',
      admin: {
        description: 'Music with this tag will be offered to the seeker',
      },
    },
    {
      name: 'frames',
      type: 'json',
      admin: {
        description: 'Frames associated with this meditation with audio-synchronized editing',
        components: {
          Field: '@/components/admin/MeditationFrameEditor/index.tsx#default',
        },
      },
      validate: (value) => {
        // Validate that value is an array of frame objects
        if (!value) return true // Allow empty/null values

        if (!Array.isArray(value)) {
          return 'Frames must be an array'
        }

        for (let i = 0; i < value.length; i++) {
          const frame = value[i]

          if (!frame || typeof frame !== 'object') {
            return `Frame ${i + 1} must be an object`
          }

          if (!frame.id || typeof frame.id !== 'string') {
            return `Frame ${i + 1} must have a valid frame relationship ID`
          }

          if (
            typeof frame.timestamp !== 'number' ||
            frame.timestamp < 0 ||
            isNaN(frame.timestamp)
          ) {
            return `Frame ${i + 1} must have a valid timestamp (number >= 0)`
          }
        }

        // Check for duplicate timestamps
        const timestamps = value.map((f: { timestamp: number }) => f.timestamp)
        const uniqueTimestamps = new Set(timestamps)
        if (timestamps.length !== uniqueTimestamps.size) {
          return 'Duplicate timestamps are not allowed. Each frame must have a unique timestamp.'
        }

        return true
      },
      hooks: {
        beforeChange: [
          async ({ value }) => {
            if (!value || !Array.isArray(value)) return []

            return value
              .map((v) => {
                return { id: v.id, timestamp: v.timestamp } as KeyframeDefinition
              })
              .sort((a, b) => a.timestamp - b.timestamp)
          },
        ],
        afterRead: [
          async ({ value, req }) => {
            if (!value || !Array.isArray(value)) return []
            const frames = value as KeyframeData[]

            const frameIds = frames.map((f) => f.id)
            if (frameIds.length === 0) return []

            const frameDocs = await req.payload.find({
              collection: 'frames',
              where: { id: { in: frameIds } },
              limit: frameIds.length,
            })

            // Create map of relevant frame data
            const frameMap = Object.fromEntries(frameDocs.docs.map((frame) => [frame.id, frame]))

            // Add data to each frame and sort by timestamp
            return frames.map((v) => {
              return {
                ...v,
                ...frameMap[v.id],
                timestamp: Math.round(v.timestamp),
              } as KeyframeData
            })
          },
        ],
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
  ],
}
