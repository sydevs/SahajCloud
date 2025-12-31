import type { CollectionConfig } from 'payload'

import { CLIENT_ROLE_OPTIONS } from '@/generated/access'
import { validateClientData, checkHighUsageAlert } from '@/hooks/clientHooks'

export const Clients: CollectionConfig = {
  slug: 'clients',
  auth: {
    useAPIKey: true,
    disableLocalStrategy: true, // Only API key authentication
  },
  indexes: [
    {
      fields: ['active'],
    },
  ],
  labels: {
    singular: 'Service',
    plural: 'Services',
  },
  admin: {
    group: 'Access',
    useAsTitle: 'name',
    defaultColumns: ['name', 'active'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Client Name',
      admin: {
        description: 'Client organization or application name',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Notes',
      admin: {
        description: 'Purpose and usage notes for this client',
      },
    },
    // Roles field (non-localized multi-select)
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: [...CLIENT_ROLE_OPTIONS],
      admin: {
        description: 'Assign API client roles. Roles apply to all locales.',
        components: {
          afterInput: ['@/components/admin/PermissionsTable'],
        },
      },
    },
    {
      name: 'managers',
      type: 'relationship',
      relationTo: 'managers',
      hasMany: true,
      required: true,
      admin: {
        description: 'Users who can manage this client',
      },
    },
    {
      name: 'primaryContact',
      type: 'relationship',
      relationTo: 'managers',
      hasMany: false,
      required: true,
      admin: {
        description: 'Primary user contact for this client',
      },
    },
    {
      name: 'domains',
      type: 'text',
      admin: {
        description: 'What domains are associated with this client. Put each domain on a new line.',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Enable or disable API access for this client',
      },
    },
    {
      name: 'keyGeneratedAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'Timestamp of last API key generation',
        position: 'sidebar',
      },
    },
    {
      name: 'usageStats',
      type: 'group',
      admin: {
        description: 'API usage statistics',
        position: 'sidebar',
      },
      fields: [
        {
          name: 'totalRequests',
          type: 'number',
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: 'All-time request count',
          },
        },
        {
          name: 'dailyRequests',
          type: 'number',
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: "Today's request count",
          },
        },
        {
          name: 'maxDailyRequests',
          type: 'number',
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: 'Maximum historical request count',
          },
        },
        {
          name: 'lastRequestAt',
          type: 'date',
          admin: {
            readOnly: true,
            description: 'Last API call timestamp',
          },
        },
        {
          name: 'highUsageAlert',
          type: 'checkbox',
          virtual: true,
          admin: {
            readOnly: true,
            description: 'Indicates if daily limit exceeded (>1000 requests)',
            components: {
              Field: {
                path: '@/components/admin/HighUsageAlert',
                clientProps: {
                  threshold: 1000,
                },
              },
            },
          },
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [validateClientData],
    afterChange: [checkHighUsageAlert],
  },
}
