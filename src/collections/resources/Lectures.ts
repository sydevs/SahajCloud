import type { CollectionConfig } from 'payload'

import { UrlField } from '@/fields'
import { roleBasedAccess } from '@/lib/accessControl'
import { handleProjectVisibility } from '@/lib/projectVisibility'

export const Lectures: CollectionConfig = {
  slug: 'lectures',
  access: roleBasedAccess('lectures'),
  labels: {
    singular: 'Lecture',
    plural: 'Lectures',
  },
  admin: {
    group: 'Resources',
    useAsTitle: 'title',
    hidden: handleProjectVisibility('lectures', ['wemeditate-web', 'wemeditate-app']),
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'thumbnail',
      type: 'upload',
      relationTo: 'images',
      required: true,
    },
    UrlField({
      name: 'videoUrl',
      required: true,
    }),
    UrlField({
      name: 'subtitlesUrl',
    }),
  ],
}
