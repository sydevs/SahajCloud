import type { CollectionConfig, Validate } from 'payload'

import { colorField, slugField } from '@/fields'
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
    defaultColumns: ['title', 'filename', 'color', 'meditationType', 'parent', 'meditations'],
  },
  upload: {
    staticDir: 'media/meditation-tags',
    hideRemoveFile: true,
    mimeTypes: ['image/svg+xml'],
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
    // Time-of-day suitability for this category
    {
      name: 'timings',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Morning', value: 'morning' },
        { label: 'Afternoon', value: 'afternoon' },
        { label: 'Evening', value: 'evening' },
        { label: 'Night', value: 'night' },
      ],
      admin: {
        description: 'When this meditation category is most suitable',
      },
    },
    // General or Specific classification
    {
      name: 'meditationType',
      type: 'select',
      options: [
        { label: 'General', value: 'general' },
        { label: 'Specific', value: 'specific' },
      ],
      admin: {
        description: 'Whether this is a general or technique-specific category',
      },
    },
    // Parent category for single-level nesting
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'meditation-tags',
      admin: {
        description:
          'Parent category for grouping. Parent categories are not selectable on meditations.',
      },
      filterOptions: ({ id }) => {
        if (id) {
          return { id: { not_equals: id } }
        }
        return true
      },
      validate: (async (value, options) => {
        if (!value) return true

        const { req, id } = options

        // Selected parent must not already have a parent (prevents A→B→C chains)
        const parentTag = await req.payload.findByID({
          collection: 'meditation-tags',
          id: value as number,
          depth: 0,
        })

        if (parentTag?.parent) {
          return 'Cannot select a tag that already has a parent. Only single-level nesting is allowed.'
        }

        // Current tag must not have children (a parent cannot become a child)
        if (id) {
          const children = await req.payload.find({
            collection: 'meditation-tags',
            where: { parent: { equals: id } },
            limit: 1,
            depth: 0,
          })

          if (children.totalDocs > 0) {
            return 'Cannot set a parent on a tag that already has children. Only single-level nesting is allowed.'
          }
        }

        return true
      }) as Validate,
    },
    // Child categories (computed from parent relationship)
    {
      name: 'children',
      type: 'join',
      collection: 'meditation-tags',
      on: 'parent',
      admin: {
        components: {
          Cell: '@/components/admin/RelationshipCountCell',
        },
      },
    },
    // Bidirectional join to meditations
    {
      name: 'meditations',
      type: 'join',
      collection: 'meditations',
      on: 'tags',
      defaultLimit: 100,
      admin: {
        components: {
          Cell: '@/components/admin/RelationshipCountCell',
        },
      },
    },
  ],
}
