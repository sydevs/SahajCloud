import type { CollectionConfig } from 'payload'
import sharp from 'sharp'
import {
  getVideoDuration,
  getVideoDimensions,
  validateVideoDuration,
  validateVideoFileSize,
} from '@/lib/videoUtils'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { FRAME_CATEGORY_OPTIONS, GENDER_OPTIONS } from '@/lib/data'

export const Frames: CollectionConfig = {
  labels: {
    plural: 'Meditation Frames',
    singular: 'Meditation Frame',
  },
  slug: 'frames',
  access: permissionBasedAccess('frames'),
  upload: {
    staticDir: 'media/frames',
    mimeTypes: [
      // Images
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      // Videos
      'video/mp4',
      'video/webm',
    ],
    adminThumbnail: 'small',
    imageSizes: [
      {
        name: 'small',
        width: 160,
        height: 160,
        position: 'centre',
      },
      {
        name: 'medium',
        width: 320,
        height: 320,
        position: 'centre',
      },
      {
        name: 'full',
        width: 1000,
        height: 1000,
        position: 'centre',
      },
    ],
  },
  admin: {
    group: 'Resources',
    useAsTitle: 'filename',
    defaultColumns: ['category', 'tags', 'preview', 'imageSet'],
  },
  hooks: {
    afterRead: [trackClientUsageHook],
    beforeValidate: [
      async ({ data, req }) => {
        // Validate file size based on file type
        if (req.file && req.file.data && req.file.mimetype) {
          const { mimetype, size } = req.file

          if (mimetype.startsWith('image/')) {
            // Validate image file size (10MB limit)
            if (size && size > 10485760) {
              // 10MB in bytes
              throw new Error('Image file size must be 10MB or less')
            }
          } else if (mimetype.startsWith('video/')) {
            // Validate video file size (100MB limit)
            const fileSizeValidation = validateVideoFileSize(size || 0, 100)
            if (fileSizeValidation !== true) {
              throw new Error(fileSizeValidation)
            }
          }
        }

        return data
      },
    ],
    beforeChange: [
      async ({ data, req }) => {
        // Auto-populate metadata based on file type
        if (req.file && req.file.data && req.file.mimetype) {
          const { mimetype } = req.file

          try {
            if (mimetype.startsWith('image/')) {
              // For images, extract dimensions using Sharp
              const { width, height } = await sharp(req.file.data).metadata()
              if (width && height) {
                data.dimensions = { width, height }
              }

              // Auto-convert JPG to WEBP at 95% quality (similar to Media collection)
              if (mimetype === 'image/jpeg' || mimetype === 'image/png') {
                const webpBuffer = await sharp(req.file.data).webp({ quality: 95 }).toBuffer()

                // Update the file data
                req.file.data = webpBuffer
                req.file.mimetype = 'image/webp'
                req.file.name = req.file.name.replace(/\.(jpe?g|png)$/i, '.webp')
              }
            } else if (mimetype.startsWith('video/')) {
              // For videos, extract duration and dimensions
              const duration = await getVideoDuration(req.file.data)
              const dimensions = await getVideoDimensions(req.file.data)

              // Validate video duration (62 seconds max)
              const durationValidation = validateVideoDuration(duration, 62)
              if (durationValidation !== true) {
                throw new Error(durationValidation)
              }

              // Auto-populate metadata
              data.duration = Math.round(duration * 100) / 100 // Round to 2 decimal places
              data.dimensions = dimensions

              // TODO: Video conversion to WEBM would go here
              // For now, we'll keep the original format
              // In production, this would convert MP4 to WEBM with optimization
            }
          } catch (error) {
            req.payload.logger.error({
              msg: 'Frame file processing failed',
              err: error,
              fileName: req.file.name,
              mimeType: req.file.mimetype,
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
      name: 'preview',
      type: 'text',
      virtual: true,
      admin: {
        hidden: true,
        components: {
          Cell: '@/components/admin/ThumbnailCell',
        },
      },
    },
    {
      name: 'imageSet',
      type: 'select',
      options: GENDER_OPTIONS,
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      options: [...FRAME_CATEGORY_OPTIONS],
      required: true,
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'frame-tags',
      hasMany: true,
    },
    {
      name: 'dimensions',
      type: 'json',
      admin: {
        description: 'Auto-populated dimensions for images (width/height)',
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'duration',
      type: 'number',
      admin: {
        description: 'Auto-populated duration for videos (in seconds)',
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
