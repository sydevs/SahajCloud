import type { CollectionConfig } from 'payload'

import { slugField } from '@/fields'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    group: 'Resources',
    useAsTitle: 'name',
    defaultColumns: ['name', 'title', 'countryCode'],
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
    {
      name: 'image',
      type: 'upload',
      relationTo: 'images',
      admin: {
        description: 'Author profile image',
      },
    },
    {
      name: 'articles',
      type: 'join',
      collection: 'pages',
      on: 'author',
    },
  ],
}
