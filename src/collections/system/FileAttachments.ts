import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'

export const FileAttachmentOwnerSlugs = ['lessons']

export const FileAttachments: CollectionConfig = {
  slug: 'file-attachments',
  access: permissionBasedAccess('file-attachments', {
    delete: () => false,
  }),
  disableDuplicate: true,
  admin: {
    hidden: ({ user }) => !user?.admin,
    group: 'System',
    useAsTitle: 'filename',
    description:
      'These are file attachments uploaded to support other collections. These should not be reused and will be deleted whenever their owner is deleted.',
    defaultColumns: ['filename', 'owner', 'createdAt'],
  },
  upload: {
    hideRemoveFile: true,
    staticDir: 'media/files',
    mimeTypes: ['application/pdf', 'audio/mpeg', 'video/mpeg', 'video/mp4', 'image/webp'],
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
  ],
}
