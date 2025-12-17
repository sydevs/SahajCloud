import type { CollectionConfig } from 'payload'

import { slugField } from 'payload'

import { ColorField } from '@/fields/ColorField'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess } from '@/lib/accessControl'
import { handleProjectVisibility } from '@/lib/projectVisibility'
import { virtualUrlField } from '@/lib/storage/urlFields'

export const MeditationTags: CollectionConfig = {
  slug: 'meditation-tags',
  labels: {
    singular: 'Meditation Category',
    plural: 'Meditation Categories',
  },
  access: roleBasedAccess('meditations'),
  admin: {
    group: 'Tags',
    useAsTitle: 'title',
    hidden: handleProjectVisibility('meditation-tags', ['wemeditate-web', 'wemeditate-app']),
    defaultColumns: ['title', 'filename', 'color'],
  },
  upload: {
    staticDir: 'media/meditation-tags',
    hideRemoveFile: true,
    mimeTypes: ['image/svg+xml'],
  },
  hooks: {
    afterRead: [trackClientUsageHook],
  },
  fields: [
    // Virtual URL field for CDN delivery
    virtualUrlField({
      collection: 'meditation-tags',
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
    // Color picker (hex format)
    ...ColorField({
      name: 'color',
      label: 'Color',
      required: true,
      admin: {
        description: 'Tag color for UI theming (hex format)',
      },
    }),
    // Bidirectional join to meditations
    {
      name: 'meditations',
      type: 'join',
      collection: 'meditations',
      on: 'tags',
    },
  ],
}
