import type { CollectionConfig } from 'payload'

import { roleBasedAccess } from '@/lib/accessControl'
import { adminOnlyVisibility } from '@/lib/projectVisibility'
import { createVirtualUrlField } from '@/lib/storage/urlFields'

export const FileOwnerSlugs = ['lessons', 'frames']

export const Files: CollectionConfig = {
  slug: 'files',
  labels: {
    singular: 'File',
    plural: 'Files',
  },
  access: roleBasedAccess('files', {
    delete: () => false,
  }),
  disableDuplicate: true,
  admin: {
    hidden: adminOnlyVisibility,
    group: 'System',
    useAsTitle: 'filename',
    description:
      'These are file attachments uploaded to support other collections. These should not be reused and will be deleted whenever their owner is deleted.',
    defaultColumns: ['filename', 'owner', 'createdAt'],
  },
  upload: {
    hideRemoveFile: true,
    staticDir: 'media/files',
    mimeTypes: [
      'application/pdf',
      'audio/mpeg',
      'video/mpeg',
      'video/mp4',
      'image/webp',
      'image/png',
      'image/jpeg',
      'image/svg+xml',
    ],
  },
  fields: [
    {
      name: 'owner',
      type: 'relationship',
      relationTo: ['lessons'],
      required: false, // Allow orphan files temporarily until claimed by parent document
      maxDepth: 0,
      admin: {
        readOnly: true, // Prevent manual changes - owner is set automatically via hooks
      },
    },
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
