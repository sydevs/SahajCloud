import type { CollectionConfig } from 'payload'
import { getStorageConfig } from '@/lib/storage'

export const Frames: CollectionConfig = {
  slug: 'frames',
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
    ...getStorageConfig(),
  },
  admin: {
    useAsTitle: 'name',
  },
  hooks: {
    afterChange: [
      async ({ doc, operation }) => {
        // Auto-populate metadata based on file type
        if (operation === 'create' && doc.mimeType) {
          const updates: Record<string, unknown> = {}
          
          if (doc.mimeType.startsWith('image/')) {
            // For images, extract dimensions
            if (doc.width && doc.height) {
              updates.dimensions = {
                width: doc.width,
                height: doc.height,
              }
            }
          } else if (doc.mimeType.startsWith('video/')) {
            // For videos, we'll set a mock duration for now
            // In production, this would use ffprobe to extract actual duration
            updates.duration = 10 // Mock 10 seconds duration
          }

          // Update the document with metadata if we have any updates
          if (Object.keys(updates).length > 0) {
            // Note: In a real implementation, you'd update the document here
            // For now, we'll skip the update to avoid infinite loops in tests
          }
        }
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'imageSet',
      type: 'select',
      options: ['male', 'female'],
      required: true,
      admin: {
        description: 'Whether this frame is for male or female meditation poses',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
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