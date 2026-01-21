import type { CollectionConfig } from 'payload'

import { validateClientData } from '@/hooks/clientHooks'
import { getRoleOptions } from '@/lib/access'
import { calculateAbuseScore } from '@/lib/usage'

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
    group: 'System',
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
      options: getRoleOptions([
        'wemeditate-web-client',
        'wemeditate-app-client',
        'sahaj-atlas-client',
      ]),
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
      name: 'usage',
      type: 'group',
      admin: {
        description: 'API usage statistics',
        position: 'sidebar',
      },
      fields: [
        {
          name: 'abuseScore',
          type: 'json',
          virtual: true,
          hooks: {
            afterRead: [
              ({ siblingData }) => {
                if (!siblingData) return null
                return calculateAbuseScore(siblingData)
              },
            ],
          },
          admin: {
            readOnly: true,
            components: {
              beforeInput: ['@/components/admin/AbuseScore/AbuseScoreField'],
              Cell: '@/components/admin/AbuseScore/AbuseScoreCell',
            },
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
          name: 'peakDailyRequests',
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
        // Abuse detection fields
        {
          name: 'totalRequests',
          type: 'number',
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: 'Lifetime total requests (never resets)',
          },
        },
        {
          name: 'highUsageDays',
          type: 'number',
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: 'Count of days exceeding threshold',
          },
        },
        {
          name: 'lastHighUsageAt',
          type: 'date',
          admin: {
            readOnly: true,
            description: 'Last date threshold was exceeded',
          },
        },
        {
          name: 'firstRequestAt',
          type: 'date',
          admin: {
            readOnly: true,
            description: 'First API request (tracking start)',
          },
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [validateClientData],
  },
}
