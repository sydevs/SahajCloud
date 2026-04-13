import type { CollectionConfig } from 'payload'

import { mixedMediaUrlField, previewUrlField, streamUrlField } from '@/lib/storage/urlFields'

export const Files: CollectionConfig = {
  slug: 'files',
  labels: {
    singular: 'File',
    plural: 'Files',
  },
  trash: true,
  disableDuplicate: true,
  admin: {
    group: 'Media',
    useAsTitle: 'filename',
    description:
      'Media files (images, audio, video) and PDFs used by other collections. Orphaned files are automatically moved to trash and permanently deleted during monthly cleanup.',
    defaultColumns: ['previewUrl', 'mimeType', 'createdAt'],
  },
  upload: {
    hideRemoveFile: true,
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
    // url: direct file URL, streamUrl: HLS streaming (videos only), previewUrl: thumbnail
    mixedMediaUrlField({ collection: 'files' }),
    streamUrlField({ collection: 'files' }),
    previewUrlField({ collection: 'files' }),
  ],
}
