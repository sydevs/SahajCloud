import type { CollectionConfig } from 'payload'

import { fileMetadataField, mediaField } from '@/fields'
import { subtitlesFieldSchema } from '@/lib/utilities/subtitles'
import { restrictUploadToAdmin } from '@/plugins/access'
import { getCloudflareStreamThumbnailUrl } from '@/plugins/storage/cloudflareStreamAdapter'
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
    // Point the admin preview thumbnail at the Cloudflare Stream poster.
    // Without this, `thumbnailURL` is null and the admin edit view falls back
    // to the `url` field's Payload file route (`/api/videos/file/<id>`), which
    // 500s in production — the Stream adapter serves no bytes from Workers.
    adminThumbnail: ({ doc }) =>
      typeof doc.filename === 'string'
        ? (getCloudflareStreamThumbnailUrl(doc.filename, 320) ?? null)
        : null,
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
    {
      name: 'subtitles',
      type: 'json',
      admin: {
        description: 'Subtitle cues: [{ startTimeMs, endTimeMs, durationMs?, content }]',
      },
      jsonSchema: subtitlesFieldSchema,
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
    fileMetadataField({
      description: 'Auto-populated video metadata (duration, format, etc.)',
    }),
  ],
}
