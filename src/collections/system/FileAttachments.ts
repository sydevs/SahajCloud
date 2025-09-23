import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'

export const FileAttachmentOwnerSlugs = ['lessons', 'lesson-units']

export const FileAttachments: CollectionConfig = {
  slug: 'file-attachments',
  access: permissionBasedAccess('file-attachments', {
    update: () => false,
    delete: () => false,
  }),
  disableDuplicate: true,
  admin: {
    hidden: ({ user }) => !user?.admin,
    group: 'System',
    useAsTitle: 'filename',
    description:
      'These are file attachments uploaded to support other collections. These should not be reused and will be deleted whenever their owner is deleted.',
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
      relationTo: ['lessons', 'lesson-units'],
      required: false, // Changed to false to allow orphan files temporarily
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
