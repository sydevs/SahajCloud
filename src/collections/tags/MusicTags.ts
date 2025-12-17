import type { CollectionConfig } from 'payload'

import { slugField } from 'payload'

import { roleBasedAccess } from '@/lib/accessControl'
import { handleProjectVisibility } from '@/lib/projectVisibility'
import { virtualUrlField } from '@/lib/storage/urlFields'

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
    virtualUrlField({
      collection: 'music-tags',
      adapter: 'cloudflare-images',
    }),
    // Slug auto-generated from title
    slugField({
      useAsSlug: 'title',
      overrides: (field) => {
        if (field.fields[1].type === 'text') {
          field.fields[1].admin = {
            ...field.fields[1].admin,
            description: 'URL-friendly identifier (auto-generated from title)',
          }
        }
        return field
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
