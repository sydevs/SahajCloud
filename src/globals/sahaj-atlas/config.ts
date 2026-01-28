import type { GlobalConfig } from 'payload'

export const SahajAtlasConfig: GlobalConfig = {
  slug: 'sy-atlas-config',
  admin: {
    group: 'Sahaj Atlas',
  },
  label: 'Configuration',
  fields: [
    {
      name: 'defaultMapCenter',
      label: 'Default Map Center',
      type: 'group',
      fields: [
        {
          name: 'latitude',
          type: 'number',
          required: true,
          defaultValue: 0,
        },
        {
          name: 'longitude',
          type: 'number',
          required: true,
          defaultValue: 0,
        },
      ],
    },
    {
      name: 'defaultZoomLevel',
      label: 'Default Zoom Level',
      type: 'number',
      min: 1,
      max: 20,
      defaultValue: 10,
    },
  ],
}
