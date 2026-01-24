import type { CollectionConfig } from 'payload'

import { mediaField, slugField } from '@/fields'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    group: 'Metadata',
    useAsTitle: 'name',
    defaultColumns: ['name', 'photo', 'articles'],
  },
  fields: [
    // Slug auto-generated from name
    slugField({
      useAsSlug: 'name',
      description: 'URL-friendly identifier (auto-generated from {sourceField})',
    }),
    {
      name: 'name',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'title',
      type: 'text',
      localized: true,
      admin: {
        description: 'Professional title (e.g., "Artist, writer and stylist")',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      localized: true,
      admin: {
        description: 'Biography or description of the author',
      },
    },
    {
      name: 'countryCode',
      type: 'text',
      admin: {
        description: 'ISO 2-letter country code',
      },
    },
    {
      name: 'yearsMeditating',
      type: 'number',
      admin: {
        description: 'Years of meditation experience',
      },
    },
    mediaField({
      name: 'photo',
      admin: {
        description: 'Author profile photo',
      },
    }),
    {
      name: 'articles',
      type: 'join',
      collection: 'pages',
      on: 'author',
      defaultLimit: 100,
      admin: {
        components: {
          Cell: '@/components/admin/RelationshipCountCell',
        },
      },
    },
  ],
}
