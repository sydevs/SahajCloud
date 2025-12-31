import type { CollectionConfig } from 'payload'

import { slugField } from '@/fields'
import { virtualUrlField } from '@/lib/storage/urlFields'

export const MusicTags: CollectionConfig = {
  slug: 'music-tags',
  labels: {
    singular: 'Music Category',
    plural: 'Music Categories',
  },
  admin: {
    group: 'Tags',
    useAsTitle: 'title',
    defaultColumns: ['title', 'filename'],
  },
  upload: {
    staticDir: 'media/music-tags',
    hideRemoveFile: true,
    mimeTypes: ['image/svg+xml'],
  },
  fields: [
    // Virtual URL field for CDN delivery (R2 for SVG support)
    virtualUrlField({
      collection: 'music-tags',
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
    // Bidirectional join to music
    {
      name: 'music',
      type: 'join',
      collection: 'music',
      on: 'tags',
    },
  ],
}
