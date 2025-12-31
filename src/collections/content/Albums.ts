import type { CollectionConfig } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { createFieldAccess } from '@/lib/access'
import { virtualUrlField } from '@/lib/storage/urlFields'

export const Albums: CollectionConfig = {
  slug: 'albums',
  labels: {
    singular: 'Album',
    plural: 'Albums',
  },
  trash: true,
  disableDuplicate: true,
  upload: {
    staticDir: 'media/albums',
    hideRemoveFile: true,
    focalPoint: true,
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'artist', 'filename'],
  },
  hooks: {
    afterRead: [trackClientUsageHook],
  },
  fields: [
    virtualUrlField({
      collection: 'albums',
      adapter: 'cloudflare-images',
    }),
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      access: createFieldAccess('music', true),
    },
    {
      name: 'artist',
      type: 'text',
      required: true,
      localized: true,
      access: createFieldAccess('music', true),
    },
    {
      name: 'artistUrl',
      type: 'text',
      access: createFieldAccess('music', false),
      admin: {
        description: 'Artist website or profile URL',
      },
    },
    {
      name: 'music',
      type: 'join',
      collection: 'music',
      on: 'album',
      admin: {
        description: 'Music tracks in this album',
      },
    },
  ],
}
