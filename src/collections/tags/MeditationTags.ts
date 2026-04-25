import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { APIError } from 'payload'

import { colorField, slugField } from '@/fields'
import {
  clearIsParentOnDelete,
  maintainIsParent,
  validateNesting,
} from '@/hooks/meditationTagHooks'
import { adminOnlyCondition, adminOnlyFieldAccess, isAdminManager } from '@/lib/access'
import { virtualUrlField } from '@/lib/storage/urlFields'

/**
 * Block non-admin managers from replacing the uploaded icon.
 *
 * Field-level `access.update` covers scalar fields, but the upload's file
 * payload isn't a field — it arrives via `req.file`. Reject the request
 * before the storage adapter touches it.
 *
 * Scope note: we only gate the binary replacement. The implicit upload
 * metadata columns (`filename`, `mimeType`, `filesize`) cannot take
 * per-field `access.update` because they aren't in the `fields` array; a
 * non-admin editor could PATCH them via REST. That would desync the URL
 * from the stored object but not exfiltrate data or replace the icon
 * binary, so it's accepted as low-risk.
 */
const restrictIconUploadToAdmin: CollectionBeforeChangeHook = ({ req, operation }) => {
  if (operation !== 'update') return
  if (isAdminManager(req.user)) return
  if (req.file) {
    throw new APIError('Only admins can replace the icon on a meditation category.', 403)
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
    // Slug auto-generated from title. Hide the whole row from non-admins
    // (the row is in the sidebar) and lock the inner `slug` text at the
    // access layer. The sibling `generateSlug` checkbox is already
    // `admin.hidden: true` upstream and doesn't need its own access guard.
    slugField({
      useAsSlug: 'title',
      description: 'URL-friendly identifier (auto-generated from {sourceField})',
      overrides: (field) => {
        field.admin = { ...(field.admin ?? {}), condition: adminOnlyCondition }
        const slugInner = field.fields.find(
          (f) => 'name' in f && f.name === 'slug' && f.type === 'text',
        )
        if (slugInner && slugInner.type === 'text') {
          slugInner.access = { ...(slugInner.access ?? {}), update: adminOnlyFieldAccess }
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
      access: { update: adminOnlyFieldAccess },
      admin: {
        condition: adminOnlyCondition,
        description: 'Localized title shown to public users',
      },
    },
    // Color picker (hex format)
    colorField({
      name: 'color',
      label: 'Color',
      required: true,
      access: { update: adminOnlyFieldAccess },
      admin: {
        condition: adminOnlyCondition,
        description: 'Tag color for UI theming (hex format)',
      },
    }),
    // Parent category for single-level nesting.
    //
    // Note: condition is intentionally NOT user-gated (unlike sibling
    // admin-only fields). Payload skips `validateFilterOptions` for any field
    // whose `admin.condition` returns false, so hiding `parent` from
    // non-admins would also disable the multi-level-nesting check on Local
    // API writes that bypass access. Non-admins still see the dropdown but
    // their edits are silently stripped by `access.update`.
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'meditation-tags',
      maxDepth: 1,
      access: { update: adminOnlyFieldAccess },
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
      access: { update: adminOnlyFieldAccess },
      admin: {
        condition: adminOnlyCondition,
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
      access: { update: adminOnlyFieldAccess },
      admin: {
        condition: adminOnlyCondition,
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
      access: { update: adminOnlyFieldAccess },
      admin: {
        condition: (data, _siblingData, { user }) => !data.isParent && isAdminManager(user),
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
    // Whether this tag has children (auto-maintained by hooks).
    // Hooks update this on the *parent* tag when a child's parent relationship
    // changes — they don't self-correct a doc that gets `isParent` flipped
    // directly via API. The field-level access guards against that, so a
    // non-admin editor with `meditation-tags` update permission can't corrupt
    // the nesting tree by PATCHing `{ isParent: true }` themselves.
    {
      name: 'isParent',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      index: true,
      access: { update: adminOnlyFieldAccess },
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
