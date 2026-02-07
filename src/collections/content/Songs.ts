import type { CollectionConfig } from 'payload'

import { virtualUrlField } from '@/lib/storage/urlFields'

export const Songs: CollectionConfig = {
  slug: 'songs',
  trash: true,
  upload: {
    staticDir: 'media/songs',
    hideRemoveFile: true,
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg'],
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'album', 'duration', 'tags'],
    hidden: true, // Always hidden - managed through Albums
  },
  fields: [
    virtualUrlField({
      collection: 'songs',
      adapter: 'r2',
      name: 'audioUrl',
    }),
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'album',
      type: 'relationship',
      relationTo: 'albums',
      required: true,
      admin: {
        description: 'The album this track belongs to',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'song-tags',
      hasMany: true,
      admin: {
        components: {
          Field: '@/components/admin/TagSelector',
        },
      },
    },
    {
      name: 'fileMetadata',
      type: 'json',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
