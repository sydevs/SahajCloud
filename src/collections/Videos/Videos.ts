import type { CollectionConfig } from 'payload'

import { fileMetadataField, mediaField } from '@/fields'
import { jsonField } from '@/fields/jsonField'
import { subtitlesSchema } from '@/lib/utilities/subtitles'
import { restrictUploadToAdmin } from '@/plugins/access'
import { videoAdminThumbnail } from '@/plugins/storage/adminThumbnail'
import {
  hlsUrlField,
  mixedMediaUrlField,
  mp4UrlField,
  previewUrlField,
} from '@/plugins/storage/urlFields'

export const Videos: CollectionConfig = {
  slug: 'videos',
  labels: {
    singular: 'Video',
    plural: 'Videos',
  },
  hooks: {
    beforeChange: [restrictUploadToAdmin({ label: 'video file' })],
  },
  upload: {
    staticDir: 'media/videos',
    mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    adminThumbnail: videoAdminThumbnail,
  },
  admin: {
    group: 'Media',
    useAsTitle: 'title',
    defaultColumns: ['title', 'tags', 'previewUrl'],
  },
  fields: [
    // `url` resolves to the Stream HLS manifest (mirrors Frames). This overrides
    // Payload's default file-route url (`/api/videos/file/<id>`), which 500s in
    // production because Cloudflare Stream serves the bytes, not the Worker. HLS
    // is used over the MP4 download so the link is live immediately after
    // transcoding — the MP4 URL 404s until the Stream webhook enables downloads
    // (exposed separately as `mp4Url`).
    mixedMediaUrlField({ collection: 'videos' }),
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
    jsonField({
      name: 'subtitles',
      schemaTitle: 'Subtitles',
      schema: subtitlesSchema,
      admin: {
        description: 'Subtitle cues: [{ startTimeMs, endTimeMs, durationMs?, content }]',
      },
    }),
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
    fileMetadataField({
      description: 'Auto-populated video metadata (duration, format, etc.)',
    }),
  ],
}
