import type { CollectionConfig } from 'payload'

import { roleBasedAccess } from '@/lib/accessControl'
import { adminOnlyVisibility } from '@/lib/projectVisibility'
import { createVirtualUrlField } from '@/lib/storage/urlFields'

export const Files: CollectionConfig = {
  slug: 'files',
  labels: {
    singular: 'File',
    plural: 'Files',
  },
  access: roleBasedAccess('files'),
  trash: true,
  disableDuplicate: true,
  admin: {
    hidden: adminOnlyVisibility,
    group: 'System',
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
    createVirtualUrlField({
      collection: 'files',
      adapter: 'r2',
    }),
  ],
}
