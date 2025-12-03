import type { GlobalConfig } from 'payload'

import { roleBasedAccess } from '@/lib/accessControl'
import { handleProjectVisibility } from '@/lib/projectVisibility'

export const SahajAtlasSettings: GlobalConfig = {
  slug: 'sahaj-atlas-settings',
  access: roleBasedAccess('sahaj-atlas-settings'),
  admin: {
    group: 'System',
    hidden: handleProjectVisibility(['sahaj-atlas'], { excludeFromAdminView: true }),
  },
  label: 'Sahaj Atlas',
  fields: [
    {
      name: 'atlasVersion',
      label: 'Atlas Version',
      type: 'text',
      admin: {
        description: 'Current Sahaj Atlas version',
        readOnly: true,
      },
    },
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
