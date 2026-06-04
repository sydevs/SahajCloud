import type { CollectionConfig } from 'payload'

import { colorField, slugField } from '@/fields'
import {
  adminOnlyCondition,
  adminOnlyFieldAccess,
  isAdminManager,
  restrictUploadToAdmin,
} from '@/plugins/access'
import { virtualUrlField } from '@/plugins/storage/urlFields'

import { clearIsParentOnDelete } from './hooks/clearIsParentOnDelete'
import { maintainIsParent } from './hooks/maintainIsParent'
import { validateNesting } from './hooks/validateNesting'

const isMoodChoice = (data: { type?: string } | undefined): boolean => !data || data.type !== 'goal'

export const UserChoices: CollectionConfig = {
  slug: 'user-choices',
  defaultSort: 'order',
  labels: {
    singular: 'User Choice',
    plural: 'User Choices',
  },
  admin: {
    group: 'Metadata',
    useAsTitle: 'title',
    defaultColumns: [
      'title',
      'type',
      'filename',
      'color',
      'order',
      'isFeatured',
      'parent',
      'timings',
    ],
    groupBy: true,
  },
  hooks: {
    beforeValidate: [validateNesting],
    beforeChange: [restrictUploadToAdmin({ label: 'icon on a user choice' })],
    afterChange: [maintainIsParent],
    afterDelete: [clearIsParentOnDelete],
  },
  upload: {
    staticDir: 'media/user-choices',
    mimeTypes: ['image/svg+xml'],
  },
  fields: [
    // Virtual URL field for CDN delivery (R2 for SVG support)
    virtualUrlField({ collection: 'user-choices', adapter: 'r2' }),
    // Slug auto-generated from title. Hide the whole row from non-admins
    // (the row is in the sidebar). Update access on the inner slug text and
    // generateSlug checkbox is locked to admin-only by the slugField default.
    slugField({
      useAsSlug: 'title',
      collectionSlug: 'user-choices',
      description: 'URL-friendly identifier (auto-generated from {sourceField})',
      overrides: (field) => {
        field.admin = { ...(field.admin ?? {}), condition: adminOnlyCondition }
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
    // Mood vs goal classifier
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'mood',
      access: { update: adminOnlyFieldAccess },
      options: [
        { label: 'Mood', value: 'mood' },
        { label: 'Goal', value: 'goal' },
        { label: 'Duration', value: 'duration' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Whether this choice describes how the user feels right now (mood) or what they want to work toward (goal). Time-of-day timings and per-timing meditation assignments only apply to mood choices.',
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
      relationTo: 'user-choices',
      maxDepth: 1,
      access: { update: adminOnlyFieldAccess },
      admin: {
        condition: (data) => !data.isParent,
        position: 'sidebar',
        description:
          'Parent category for grouping. Parent categories are not selectable on meditations. Editable by admin managers only.',
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
    // Timings this tag is active for (controls which meditation fields are visible).
    // Mood-only: goal-type choices don't carry per-timing meditation assignments.
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
        condition: (data, _siblingData, { user }) =>
          isMoodChoice(data) && !data.isParent && isAdminManager(user),
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
      filterOptions: { type: { equals: 'daily' } },
      admin: {
        condition: (data) =>
          isMoodChoice(data) &&
          !data.isParent &&
          Array.isArray(data.timings) &&
          data.timings.includes('morning'),
        description: 'The meditation offered for this category in the morning',
      },
    },
    {
      name: 'afternoonMeditation',
      type: 'relationship',
      relationTo: 'meditations',
      localized: true,
      filterOptions: { type: { equals: 'daily' } },
      admin: {
        condition: (data) =>
          isMoodChoice(data) &&
          !data.isParent &&
          Array.isArray(data.timings) &&
          data.timings.includes('afternoon'),
        description: 'The meditation offered for this category in the afternoon',
      },
    },
    {
      name: 'eveningMeditation',
      type: 'relationship',
      relationTo: 'meditations',
      localized: true,
      filterOptions: { type: { equals: 'daily' } },
      admin: {
        condition: (data) =>
          isMoodChoice(data) &&
          !data.isParent &&
          Array.isArray(data.timings) &&
          data.timings.includes('evening'),
        description: 'The meditation offered for this category in the evening',
      },
    },
    {
      name: 'nightMeditation',
      type: 'relationship',
      relationTo: 'meditations',
      localized: true,
      filterOptions: { type: { equals: 'daily' } },
      admin: {
        condition: (data) =>
          isMoodChoice(data) &&
          !data.isParent &&
          Array.isArray(data.timings) &&
          data.timings.includes('night'),
        description: 'The meditation offered for this category at night',
      },
    },
    // Whether this tag has children (auto-maintained by hooks).
    // Hooks update this on the *parent* tag when a child's parent relationship
    // changes — they don't self-correct a doc that gets `isParent` flipped
    // directly via API. The field-level access guards against that, so a
    // non-admin editor with `user-choices` update permission can't corrupt
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
      collection: 'user-choices',
      on: 'parent',
      admin: {
        condition: (data) => data.isParent,
        components: {
          Cell: '@/components/admin/RelationshipCountCell',
        },
      },
    },
    // Reverse join: lectures referencing this user choice
    {
      name: 'lectures',
      type: 'join',
      collection: 'lectures',
      on: 'userChoices',
      defaultLimit: 100,
      admin: {
        components: {
          Cell: {
            path: '@/components/admin/RelationshipCountCell',
            serverProps: { disableLink: true },
          },
        },
      },
    },
  ],
}
