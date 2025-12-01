import type { GlobalConfig } from 'payload'

import { roleBasedAccess } from '@/lib/accessControl'

export const WeMeditateAppSettings: GlobalConfig = {
  slug: 'we-meditate-app-settings',
  access: roleBasedAccess('we-meditate-app-settings'),
  admin: {
    group: 'Configuration',
  },
  label: 'WeMeditate App',
  fields: [
    {
      name: 'appVersion',
      label: 'App Version',
      type: 'text',
      admin: {
        description: 'Current mobile app version',
        readOnly: true,
      },
    },
    {
      name: 'featuredMeditations',
      label: 'Featured Meditations',
      type: 'relationship',
      relationTo: 'meditations',
      hasMany: true,
      maxRows: 10,
      admin: {
        description: 'Select up to 10 meditations to feature in the mobile app',
      },
    },
    {
      name: 'featuredLessons',
      label: 'Featured Lessons',
      type: 'relationship',
      relationTo: 'lessons',
      hasMany: true,
      maxRows: 10,
      admin: {
        description: 'Select up to 10 lessons to feature in the mobile app',
      },
    },
  ],
}
