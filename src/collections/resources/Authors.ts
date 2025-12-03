import type { CollectionConfig } from 'payload'

import { roleBasedAccess } from '@/lib/accessControl'
import { handleProjectVisibility } from '@/lib/projectVisibility'

export const Authors: CollectionConfig = {
  slug: 'authors',
  access: roleBasedAccess('pages'),
  admin: {
    group: 'Resources',
    useAsTitle: 'name',
    defaultColumns: ['name', 'title', 'countryCode'],
    hidden: handleProjectVisibility(['wemeditate-web']),
  },
  fields: [
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
