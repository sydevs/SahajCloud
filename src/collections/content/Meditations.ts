import type { CollectionConfig, Validate } from 'payload'
import { getAudioDuration, validateAudioDuration, validateAudioFileSize } from '@/lib/audioUtils'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { FrameData } from '@/components/admin/MeditationFrameEditor/types'

export const Meditations: CollectionConfig = {
  slug: 'meditations',
  access: permissionBasedAccess('meditations'),
  trash: true,
  upload: {
    staticDir: 'media/meditations',
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg'],
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
  },
  hooks: {
    afterRead: [trackClientUsageHook],
    beforeChange: [
      ({ data, operation, originalDoc }) => {
        // Generate slug from title
        if (operation === 'create' && data.title) {
          // Always generate slug on create, ignore any provided slug
          data.slug = data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        } else if (operation === 'update' && originalDoc) {
          // Preserve original slug on update
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

            // Auto-populate duration in seconds
            data.duration = Math.round(duration) // Round to nearest second
          } catch (error) {
            req.payload.logger.error({
              msg: 'Audio file validation failed',
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
      name: 'locale',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Italian', value: 'it' },
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

          if (!frame.frame || typeof frame.frame !== 'string') {
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
          ({ value }) => {
            if (!value || !Array.isArray(value)) return value

            // Sort frames by timestamp for consistent ordering
            return [...value]
              .map((v) => {
                return {
                  ...v,
                  timestamp: Math.round(v.timestamp),
                }
              })
              .sort((a, b) => a.timestamp - b.timestamp)
          },
        ],
      },
    },
    {
      name: 'frameData',
      type: 'json',
      virtual: true,
      admin: {
        hidden: true,
      },
      hooks: {
        afterRead: [
          async ({ data, req }) => {
            const frames = (data?.frames as FrameData[]) || []
            if (frames.length === 0) return []

            const frameIds = frames.map((f) => f?.frame).filter(Boolean)
            if (frameIds.length === 0) return []

            const frameDocs = await req.payload.find({
              collection: 'frames',
              where: { id: { in: frameIds } },
              limit: frameIds.length,
            })

            const frameMap = Object.fromEntries(frameDocs.docs.map((frame) => [frame.id, frame]))

            return frames
              .map((item) => {
                const frameDoc = frameMap[item.frame]
                if (!frameDoc?.url) {
                  req.payload.logger.warn(
                    `Frame ${item.frame} not found for meditation ${data?.id}`,
                  )
                  return null
                }
                return { url: frameDoc.url, timestamp: item.timestamp }
              })
              .filter(Boolean)
              .sort((a: any, b: any) => a.timestamp - b.timestamp)
          },
        ],
      },
    },
  ],
}
