import type { GlobalConfig } from 'payload'

export const WeMeditateAppConfig: GlobalConfig = {
  slug: 'wm-app-config',
  admin: {
    group: 'WeMeditate App',
  },
  label: 'Configuration',
  fields: [
    {
      name: 'selfRealizationMeditation',
      type: 'relationship',
      relationTo: 'meditations',
      localized: true,
      admin: {
        description: 'Self-realization meditation for new users',
      },
    },
  ],
}
