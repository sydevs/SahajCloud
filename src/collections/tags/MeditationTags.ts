import type { CollectionBeforeChangeHook, CollectionConfig, FieldAccess } from 'payload'

import { colorField, slugField } from '@/fields'
import {
  clearIsParentOnDelete,
  maintainIsParent,
  validateNesting,
} from '@/hooks/meditationTagHooks'
import { virtualUrlField } from '@/lib/storage/urlFields'

/**
 * Field-level access that restricts updates to admin managers only.
 * Non-admin managers (e.g. meditations-editor) can only update the per-timing
 * meditation relationship fields on meditation-tags; everything else — title,
 * slug, icon upload, color, parent, isFeatured, order, timings — stays admin-only.
 */
const adminOnlyUpdate: FieldAccess = ({ req }) =>
  req.user?.collection === 'managers' && req.user?.type === 'admin'

/**
 * Block non-admin managers from replacing the uploaded icon.
 * Field-level access covers the scalar fields, but the upload's file payload
 * isn't a field — it arrives via `req.file`. Reject the request before the
 * storage adapter touches it.
 */
const restrictIconUploadToAdmin: CollectionBeforeChangeHook = ({ req, operation }) => {
  if (operation !== 'update') return
  const isAdmin = req.user?.collection === 'managers' && req.user?.type === 'admin'
  if (isAdmin) return
  if (req.file) {
    throw new Error('Only admins can replace the icon on a meditation category.')
  }
}

export const MeditationTags: CollectionConfig = {
  slug: 'meditation-tags',
  defaultSort: 'order',
  labels: {
    singular: 'Meditation Category',
    plural: 'Meditation Categories',
  },
  admin: {
    group: 'Metadata',
    useAsTitle: 'title',
    defaultColumns: ['title', 'filename', 'color', 'order', 'isFeatured', 'parent', 'timings'],
  },
  hooks: {
    beforeValidate: [validateNesting],
    beforeChange: [restrictIconUploadToAdmin],
    afterChange: [maintainIsParent],
    afterDelete: [clearIsParentOnDelete],
  },
  upload: {
    staticDir: 'media/meditation-tags',
    hideRemoveFile: true,
    mimeTypes: ['image/svg+xml'],
  },
  fields: [
    // Virtual URL field for CDN delivery (R2 for SVG support)
    virtualUrlField({ collection: 'meditation-tags', adapter: 'r2' }),
    // Slug auto-generated from title
    slugField({
      useAsSlug: 'title',
      description: 'URL-friendly identifier (auto-generated from {sourceField})',
      overrides: (field) => {
        for (const inner of field.fields) {
          if (inner.type === 'text' || inner.type === 'checkbox') {
            inner.access = { ...(inner.access ?? {}), update: adminOnlyUpdate }
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
      access: { update: adminOnlyUpdate },
      admin: {
        description: 'Localized title shown to public users',
      },
    },
    // Color picker (hex format)
    colorField({
      name: 'color',
      label: 'Color',
      required: true,
      access: { update: adminOnlyUpdate },
      admin: {
        description: 'Tag color for UI theming (hex format)',
      },
    }),
    // Parent category for single-level nesting
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'meditation-tags',
      maxDepth: 1,
      access: { update: adminOnlyUpdate },
      admin: {
        condition: (data) => !data.isParent,
        position: 'sidebar',
        description:
          'Parent category for grouping. Parent categories are not selectable on meditations.',
      },
      // Only root-level tags (no parent) can be selected as parents.
      // Conditionally excludes self to avoid { not_equals: undefined } on create.
      // Payload's built-in validateFilterOptions enforces this server-side.
      filterOptions: ({ id }) => ({
        ...(id ? { id: { not_equals: id } } : {}),
        parent: { exists: false },
      }),
    },
    // Featured classification
    {
      name: 'isFeatured',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      access: { update: adminOnlyUpdate },
      admin: {
        position: 'sidebar',
        description:
          'Featured categories are shown prominently; non-featured categories appear in a dropdown',
      },
    },
    // Display order (lower numbers appear first)
    {
      name: 'order',
      type: 'number',
      defaultValue: 1,
      min: 1,
      access: { update: adminOnlyUpdate },
      admin: {
        position: 'sidebar',
        description: 'Display order (lower numbers appear first)',
      },
    },
    // Timings this tag is active for (controls which meditation fields are visible)
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
      access: { update: adminOnlyUpdate },
      admin: {
        condition: (data) => !data.isParent,
        description: 'Which times of day this category offers meditations',
        components: {
          Field: '@/components/admin/ToggleGroupField',
        },
      },
    },
    // Per-timing localized meditation assignments
    {
      name: 'morningMeditation',
      type: 'relationship',
      relationTo: 'meditations',
      localized: true,
      filterOptions: { type: { in: ['quick', 'daily'] } },
      admin: {
        condition: (data) =>
          !data.isParent && Array.isArray(data.timings) && data.timings.includes('morning'),
        description: 'The meditation offered for this category in the morning',
      },
    },
    {
      name: 'afternoonMeditation',
      type: 'relationship',
      relationTo: 'meditations',
      localized: true,
      filterOptions: { type: { in: ['quick', 'daily'] } },
      admin: {
        condition: (data) =>
          !data.isParent && Array.isArray(data.timings) && data.timings.includes('afternoon'),
        description: 'The meditation offered for this category in the afternoon',
      },
    },
    {
      name: 'eveningMeditation',
      type: 'relationship',
      relationTo: 'meditations',
      localized: true,
      filterOptions: { type: { in: ['quick', 'daily'] } },
      admin: {
        condition: (data) =>
          !data.isParent && Array.isArray(data.timings) && data.timings.includes('evening'),
        description: 'The meditation offered for this category in the evening',
      },
    },
    {
      name: 'nightMeditation',
      type: 'relationship',
      relationTo: 'meditations',
      localized: true,
      filterOptions: { type: { in: ['quick', 'daily'] } },
      admin: {
        condition: (data) =>
          !data.isParent && Array.isArray(data.timings) && data.timings.includes('night'),
        description: 'The meditation offered for this category at night',
      },
    },
    // Whether this tag has children (auto-maintained by hooks)
    {
      name: 'isParent',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      index: true,
      access: { update: adminOnlyUpdate },
      admin: {
        hidden: true,
        description: 'Automatically set when this tag has child categories',
      },
    },
    // Child categories (computed from parent relationship)
    {
      name: 'children',
      type: 'join',
      collection: 'meditation-tags',
      on: 'parent',
      admin: {
        condition: (data) => data.isParent,
        components: {
          Cell: '@/components/admin/RelationshipCountCell',
        },
      },
    },
  ],
}
