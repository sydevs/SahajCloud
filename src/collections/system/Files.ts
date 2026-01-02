import type { CollectionConfig } from 'payload'

import { virtualUrlField } from '@/lib/storage/urlFields'

export const Files: CollectionConfig = {
  slug: 'files',
  labels: {
    singular: 'File',
    plural: 'Files',
  },
  trash: true,
  disableDuplicate: true,
  admin: {
    group: 'Resources',
    useAsTitle: 'filename',
    description:
      'Audio, video, and PDF files used by other collections. Orphaned files are automatically moved to trash and permanently deleted during monthly cleanup.',
    defaultColumns: ['filename', 'mimeType', 'createdAt'],
  },
  upload: {
    hideRemoveFile: true,
    staticDir: 'media/files',
    mimeTypes: ['application/pdf', 'audio/mpeg', 'video/mpeg', 'video/mp4'],
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
    virtualUrlField({
      collection: 'files',
      adapter: 'r2',
    }),
  ],
}
