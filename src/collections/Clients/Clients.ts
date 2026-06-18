import type { CollectionConfig } from 'payload'

import { colorField, legacyMigrationFields } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'
import { getRoleOptions } from '@/plugins/access'
import { calculateAbuseScore } from '@/plugins/usage'

import { ensureClientId } from './hooks/ensureClientId'
import { validateClientData } from './hooks/validateClientData'

export const Clients: CollectionConfig = {
  slug: 'clients',
  auth: {
    useAPIKey: true,
    disableLocalStrategy: true, // Only API key authentication
  },
  // No explicit `_status` index needed — Payload auto-indexes it for
  // draft-enabled collections (matches Pages/Meditations/AppCards).
  labels: {
    singular: 'Service',
    plural: 'Services',
  },
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['name', '_status'],
  },
  // Publish/unpublish is the auth gate: only `_status === 'published'` clients
  // authenticate (see bypassPermissions + requireActiveClient). One version per
  // doc — we only need the latest published/draft state, not a version history.
  versions: {
    drafts: true,
    maxPerDoc: 1,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
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
              type: 'row',
              fields: [
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
                    description:
                      'Primary user contact for this client. Only needed when more than one manager is assigned.',
                    // Hidden (and not required) with a single manager — that
                    // lone manager is implicitly the primary contact.
                    condition: (data) => Array.isArray(data?.managers) && data.managers.length > 1,
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'Atlas Config',
          admin: {
            condition: (data) =>
              Array.isArray(data?.roles) && data.roles.includes('sahaj-atlas-client'),
          },
          fields: [
            {
              name: 'allowedDomains',
              type: 'textarea',
              admin: {
                description:
                  'What domains are associated with this client. Put each domain on a new line.',
              },
            },
            {
              type: 'row',
              fields: [
                colorField({ name: 'color1', label: 'Primary Color' }),
                colorField({ name: 'color2', label: 'Secondary Color' }),
                colorField({ name: 'color3', label: 'Tertiary Color' }),
              ],
            },
            {
              name: 'locale',
              type: 'select',
              options: getLanguageOptions(),
              admin: { description: 'Primary language for this service (any language).' },
            },
            {
              name: 'region',
              type: 'relationship',
              relationTo: 'regions',
              admin: { description: 'Atlas geographic scope for this service.' },
            },
            {
              name: 'legacyConfig',
              type: 'json',
              admin: {
                readOnly: true,
                description: 'Deprecated Atlas config (routing_type, embed_type, default_view).',
              },
            },
          ],
        },
      ],
    },
    {
      name: 'clientId',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Public identifier for this service. Auto-generated, or the Atlas public key for imported services.',
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
    ...legacyMigrationFields(),
  ],
  hooks: {
    beforeChange: [validateClientData, ensureClientId],
  },
}
