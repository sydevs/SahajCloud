import type { CollectionConfig } from 'payload'

import { roleBasedAccess } from '@/lib/accessControl'
import { handleProjectVisibility } from '@/lib/projectVisibility'

export const ImageTags: CollectionConfig = {
  slug: 'image-tags',
  access: roleBasedAccess('images'),
  admin: {
    group: 'Tags',
    useAsTitle: 'title',
    hidden: handleProjectVisibility('image-tags', ['wemeditate-web', 'wemeditate-app', 'sahaj-atlas']),
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'images',
      type: 'join',
      collection: 'images',
      on: 'tags',
    },
  ],
}
