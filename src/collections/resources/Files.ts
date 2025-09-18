import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'

export const Files: CollectionConfig = {
  slug: 'files',
  access: permissionBasedAccess('files', {
    update: () => false,
  }),
  disableDuplicate: true,
  admin: {
    group: 'Resources',
    useAsTitle: 'filename',
    description:
      'These are files uploaded to support other collections. These should not be reused and will be deleted whenever their owner is deletet.',
    defaultColumns: ['filename', 'createdAt'],
  },
  upload: {
    staticDir: 'media/files',
    mimeTypes: ['application/pdf', 'audio/mpeg', 'video/mpeg', 'image/webp'],
  },
  fields: [
    {
      name: 'owner',
      type: 'relationship',
      relationTo: ['lessons'],
      required: true,
      maxDepth: 0,
    },
    {
      name: 'createdAt',
      type: 'date',
      label: 'Uploaded At',
      admin: {
        readOnly: true,
        date: {
          displayFormat: 'MMM dd, yyyy h:mm a',
        },
      },
    },
  ],
}
