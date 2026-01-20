import type { CollectionConfig } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { previewUrlField, virtualUrlField } from '@/lib/storage/urlFields'

export const Videos: CollectionConfig = {
  slug: 'videos',
  labels: {
    singular: 'Video',
    plural: 'Videos',
  },
  upload: {
    staticDir: 'media/videos',
    hideRemoveFile: true,
    mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'tags', 'previewUrl'],
  },
  hooks: {
    afterRead: [trackClientUsageHook],
  },
  fields: [
    // Virtual URL fields for Cloudflare Stream
    virtualUrlField({ collection: 'videos', adapter: 'cloudflare-stream' }),
    previewUrlField({ collection: 'videos' }),
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: 'Video title shown to users',
      },
    },
    {
      name: 'subtitles',
      type: 'json',
      admin: {
        description: 'Array of subtitle entries: [{startTime, endTime, text}]',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'video-tags',
      hasMany: true,
      admin: {
        description: 'Tags for organizing and filtering videos',
      },
    },
    {
      name: 'fileMetadata',
      type: 'json',
      defaultValue: {},
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Auto-populated video metadata (duration, format, etc.)',
      },
    },
  ],
}
