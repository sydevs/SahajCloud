import type { CollectionConfig } from 'payload'

import { slugField } from '@/fields'
import { virtualUrlField } from '@/lib/storage/urlFields'

export const SongTags: CollectionConfig = {
  slug: 'song-tags',
  labels: {
    singular: 'Music Category',
    plural: 'Music Categories',
  },
  admin: {
    group: 'Metadata',
    useAsTitle: 'title',
    defaultColumns: ['title', 'filename', 'songs'],
  },
  upload: {
    staticDir: 'media/song-tags',
    hideRemoveFile: true,
    mimeTypes: ['image/svg+xml'],
  },
  fields: [
    // Virtual URL field for CDN delivery (R2 for SVG support)
    virtualUrlField({
      collection: 'song-tags',
      adapter: 'r2',
    }),
    // Slug auto-generated from title
    slugField({
      useAsSlug: 'title',
      description: 'URL-friendly identifier (auto-generated from {sourceField})',
    }),
    // Title (localized, for public display)
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: 'Localized title shown to public users',
      },
    },
    // Bidirectional join to songs
    {
      name: 'songs',
      type: 'join',
      collection: 'songs',
      on: 'tags',
      admin: {
        components: {
          Cell: '@/components/admin/RelationshipCountCell',
        },
      },
    },
  ],
}
