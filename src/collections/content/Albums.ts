import type { CollectionConfig } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess, createFieldAccess } from '@/lib/accessControl'
import { handleProjectVisibility } from '@/lib/projectVisibility'
import { createVirtualUrlField } from '@/lib/storage/urlFields'

export const Albums: CollectionConfig = {
  slug: 'albums',
  labels: {
    singular: 'Album',
    plural: 'Albums',
  },
  access: roleBasedAccess('music'), // Shares permissions with Music collection
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
    hidden: handleProjectVisibility('music', ['wemeditate-web', 'wemeditate-app']),
  },
  hooks: {
    afterRead: [trackClientUsageHook],
  },
  fields: [
    createVirtualUrlField({
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
