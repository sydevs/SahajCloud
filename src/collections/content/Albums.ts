import type { CollectionConfig } from 'payload'

import { mediaField } from '@/fields'

export const Albums: CollectionConfig = {
  slug: 'albums',
  labels: {
    singular: 'Album',
    plural: 'Music Albums',
  },
  trash: true,
  disableDuplicate: true,
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'artist', 'artwork'],
  },
  fields: [
    mediaField({ name: 'artwork', label: 'Album Artwork', required: true }),
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'artist',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'artistUrl',
      type: 'text',
      admin: {
        description: 'Artist website or profile URL',
      },
    },
    {
      name: 'songs',
      type: 'join',
      collection: 'songs',
      on: 'album',
      defaultLimit: 100,
      admin: {
        description: 'Music tracks in this album',
        components: {
          Cell: '@/components/admin/RelationshipCountCell',
        },
      },
    },
  ],
}
