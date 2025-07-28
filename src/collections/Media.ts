import type { CollectionConfig } from 'payload'
import sharp from 'sharp'
import { getStorageConfig } from '@/lib/storage'
import { readApiAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Utility',
  },
  access: readApiAccess(),
  upload: {
    staticDir: 'media/images',
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
    ...getStorageConfig(),
  },
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        // Auto-convert JPG/PNG to WEBP format for main file
        if (req.file && req.file.data) {
          const { mimetype: mimeType } = req.file
          
          // Only process JPG and PNG files (WEBP files are kept as-is)
          if (mimeType === 'image/jpeg' || mimeType === 'image/png') {
            try {
              // Convert to WEBP with 95% quality
              const webpBuffer = await sharp(req.file.data)
                .webp({ quality: 95 })
                .toBuffer()
              
              // Update the file data
              req.file.data = webpBuffer
              req.file.mimetype = 'image/webp'
              req.file.name = req.file.name.replace(/\.(jpe?g|png)$/i, '.webp')
              
              // Auto-populate dimensions
              const { width, height } = await sharp(webpBuffer).metadata()
              data.dimensions = { width, height }
            } catch (error) {
              req.payload.logger.error({
                msg: 'Failed to convert image to WEBP',
                err: error,
                fileName: req.file.name,
                mimeType: req.file.mimetype,
              })
              // Let the upload continue with original format if conversion fails
            }
          } else if (mimeType === 'image/webp') {
            // For WEBP files, just extract dimensions
            try {
              const { width, height } = await sharp(req.file.data).metadata()
              data.dimensions = { width, height }
            } catch (error) {
              req.payload.logger.error({
                msg: 'Failed to extract WEBP image dimensions',
                err: error,
                fileName: req.file.name,
              })
            }
          }
        }
        
        return data
      },
    ],
    beforeValidate: [
      async ({ data, req }) => {
        // Validate file size (10MB limit)
        if (req.file && req.file.size && req.file.size > 10485760) { // 10MB in bytes
          throw new Error('Image file size must be 10MB or less')
        }
        
        return data
      },
    ],
    afterRead: [
      trackClientUsageHook,
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      admin: {
        description: 'Tags to categorize this image',
      },
    },
    {
      name: 'credit',
      type: 'text',
      admin: {
        description: 'Attribution or copyright information',
      },
    },
    {
      name: 'dimensions',
      type: 'json',
      admin: {
        description: 'Auto-populated image dimensions (width/height)',
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
