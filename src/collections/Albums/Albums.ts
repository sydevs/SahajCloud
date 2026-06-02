import type { CollectionConfig } from 'payload'

import { mediaField } from '@/fields'
import { deleteChildren } from '@/hooks/cascadeDeletion'

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
  hooks: {
    // Songs.album is `required: true` → orphaned rows without cascade.
    // See src/hooks/cascadeHelpers.ts for the rationale.
    beforeDelete: [deleteChildren({ collection: 'songs', field: 'album' })],
  },
  fields: [
    // NOTE: `artwork_id` is nullable at the DB level even though `required: true` is set
    // here. Migration 20260413_171042 intentionally keeps the column nullable because D1
    // cannot recreate the `albums` table while `songs.album_id` is NOT NULL with
    // `ON DELETE SET NULL`. If `pnpm db:migrations:create` proposes a NOT NULL ALTER for
    // `artwork_id`, DO NOT ship it without first making `songs.album_id` nullable.
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
