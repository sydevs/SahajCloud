import type { CollectionConfig } from 'payload'

import { colorField, slugField } from '@/fields'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { virtualUrlField } from '@/lib/storage/urlFields'

export const MeditationTags: CollectionConfig = {
  slug: 'meditation-tags',
  labels: {
    singular: 'Meditation Category',
    plural: 'Meditation Categories',
  },
  admin: {
    group: 'Metadata',
    useAsTitle: 'title',
    defaultColumns: ['title', 'filename', 'color', 'meditations'],
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
    // Virtual URL field for CDN delivery (R2 for SVG support)
    virtualUrlField({
      collection: 'meditation-tags',
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
    // Color picker (hex format)
    colorField({
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
      admin: {
        components: {
          Cell: '@/components/admin/RelationshipCountCell',
        },
      },
    },
  ],
}
