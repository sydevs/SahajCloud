import type { CollectionConfig } from 'payload'

import { SlugField } from '@nouance/payload-better-fields-plugin/Slug'

import { roleBasedAccess } from '@/lib/accessControl'
import { handleProjectVisibility } from '@/lib/projectVisibility'
import { createVirtualUrlField } from '@/lib/storage/urlFields'

export const MusicTags: CollectionConfig = {
  slug: 'music-tags',
  labels: {
    singular: 'Music Category',
    plural: 'Music Categories',
  },
  access: roleBasedAccess('music'),
  admin: {
    group: 'Tags',
    useAsTitle: 'title',
    hidden: handleProjectVisibility('music-tags', ['wemeditate-web', 'wemeditate-app']),
    defaultColumns: ['title', 'filename'],
  },
  upload: {
    staticDir: 'media/music-tags',
    hideRemoveFile: true,
    mimeTypes: ['image/svg+xml'],
  },
  fields: [
    // Virtual URL field for CDN delivery
    createVirtualUrlField({
      collection: 'music-tags',
      adapter: 'cloudflare-images',
    }),
    // Slug auto-generated from title
    ...SlugField('title', {
      slugOverrides: {
        unique: true,
        admin: {
          position: 'sidebar',
          description: 'URL-friendly identifier (auto-generated from title)',
        },
      },
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
