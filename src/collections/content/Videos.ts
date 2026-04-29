import type { CollectionConfig } from 'payload'

import { JSONSchema4 } from 'json-schema'

import {
  hlsUrlField,
  mp4UrlField,
  previewUrlField,
  streamUrlField,
  virtualUrlField,
} from '@/lib/storage/urlFields'
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
    group: 'Media',
    useAsTitle: 'title',
    defaultColumns: ['title', 'tags', 'previewUrl'],
  },
  fields: [
    // Virtual URL fields for Cloudflare Stream
    // mp4Url: MP4 download URL, hlsUrl: HLS streaming URL, previewUrl: thumbnail
    // url + streamUrl are deprecated aliases pending mobile-app cutover (#319)
    virtualUrlField({ collection: 'videos', adapter: 'cloudflare-stream' }),
    streamUrlField({ collection: 'videos' }),
    hlsUrlField({ collection: 'videos' }),
    mp4UrlField({ collection: 'videos' }),
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
