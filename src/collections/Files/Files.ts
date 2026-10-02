import type { CollectionConfig } from 'payload'

import { restrictUploadToAdmin } from '@/plugins/access'
import {
  hlsUrlField,
  mixedMediaUrlField,
  mp4UrlField,
  previewUrlField,
} from '@/plugins/storage/urlFields'

export const Files: CollectionConfig = {
  slug: 'files',
  labels: {
    singular: 'File',
    plural: 'Files',
  },
  trash: true,
  disableDuplicate: true,
  hooks: {
    beforeChange: [restrictUploadToAdmin({ label: 'file' })],
  },
  admin: {
    group: 'Media',
    useAsTitle: 'filename',
    description:
      'Media files (images, audio, video) and PDFs used by other collections. Nothing here is trashed or deleted automatically.',
    defaultColumns: ['previewUrl', 'mimeType', 'createdAt'],
  },
  upload: {
    staticDir: 'media/files',
    mimeTypes: [
      'application/pdf',
      'audio/mpeg',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/vtt',
      'video/mp4',
      'video/mpeg',
    ],
  },
  fields: [
    {
      name: 'createdAt',
      type: 'date',
      label: 'Uploaded At',
      admin: {
        readOnly: true,
      },
    },
    // url: direct file URL (mixed-media), hlsUrl: HLS manifest (videos),
    // mp4Url: MP4 download (videos), previewUrl: thumbnail
    mixedMediaUrlField({ collection: 'files' }),
    hlsUrlField({ collection: 'files' }),
    mp4UrlField({ collection: 'files' }),
    previewUrlField({ collection: 'files' }),
  ],
}
