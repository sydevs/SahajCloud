import type { CollectionConfig } from 'payload'

import { roleBasedAccess } from '@/lib/accessControl'

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
    hidden: true,
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
      relationTo: ['lessons', 'frames'],
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
    {
      name: 'url',
      type: 'text',
      virtual: true,
      hooks: {
        afterRead: [
          ({ data }) => {
            // Generate R2 URL if in production
            if (data?.filename && process.env.CLOUDFLARE_R2_DELIVERY_URL) {
              return `${process.env.CLOUDFLARE_R2_DELIVERY_URL}/files/${data.filename}`
            }
            // Fallback to PayloadCMS-generated URL (local storage in development)
            return data?.url
          },
        ],
      },
      admin: {
        hidden: true,
      },
    },
  ],
}
