import type { CollectionConfig } from 'payload'

import { JSONSchema4 } from 'json-schema'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { createRateLimitHook } from '@/lib/rateLimiting'
import { previewUrlField, virtualUrlField } from '@/lib/storage/urlFields'
import subtitleSchema from '@/lib/subtitlesSchema.json' with { type: 'json' }

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
    beforeOperation: [createRateLimitHook()],
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
      jsonSchema: {
        uri: 'a://subtitles.json',
        fileMatch: ['a://subtitles.json'],
        schema: subtitleSchema as JSONSchema4,
      },
    },
    {
      name: 'tags',
      type: 'select',
      hasMany: true,
      required: true,
      options: ['testimonial', 'workshop', 'event', 'technique'],
      admin: {
        components: {
          Field: '@/components/admin/TagSelector',
        },
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
      jsonSchema: {
        uri: 'a://subtitles.json',
        fileMatch: ['a://subtitles.json'],
        schema: subtitleSchema as JSONSchema4,
      },
    },
  ],
}
