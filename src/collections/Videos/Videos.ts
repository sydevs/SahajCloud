import type { CollectionConfig } from 'payload'

import { mediaField } from '@/fields'
import { subtitlesJsonSchema, validateSubtitles } from '@/lib/utilities/subtitles'
import { hlsUrlField, mp4UrlField, previewUrlField } from '@/plugins/storage/urlFields'

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
    group: 'Media',
    useAsTitle: 'title',
    defaultColumns: ['title', 'tags', 'previewUrl'],
  },
  fields: [
    hlsUrlField({ collection: 'videos' }),
    mp4UrlField({ collection: 'videos' }),
    previewUrlField({ collection: 'videos' }),
    mediaField({ name: 'thumbnail' }),
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
        description: 'Subtitle cues: [{ startTimeMs, endTimeMs, durationMs?, content }]',
      },
      validate: validateSubtitles,
      typescriptSchema: [() => subtitlesJsonSchema],
    },
    {
      name: 'tags',
      type: 'select',
      required: true,
      options: ['testimonial', 'workshop', 'event', 'technique'],
      admin: {
        components: {
          Field: '@/components/admin/ToggleGroupField',
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
    },
  ],
}
