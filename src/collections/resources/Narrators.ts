import type { CollectionConfig } from 'payload'

import { GENDER_OPTIONS } from '@/lib/data'

export const Narrators: CollectionConfig = {
  slug: 'narrators',
  admin: {
    group: 'Metadata',
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'gender',
      type: 'select',
      required: true,
      options: GENDER_OPTIONS,
    },
  ],
}
