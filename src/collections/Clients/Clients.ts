import type { CollectionConfig } from 'payload'

import { colorField, legacyMigrationFields } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'
import { getRoleOptions } from '@/plugins/access'
import { calculateAbuseScore } from '@/plugins/usage'

import { isValidCanonicalDomain, ROUTING_MODE_OPTIONS } from './canonical'
import { embedMetadataJsonSchema } from './embedMetadata'
import { clientEmbedReport } from './endpoints/report'
import { ensureClientId } from './hooks/ensureClientId'
import { validateCanonicalOwnership } from './hooks/validateCanonicalOwnership'
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
              name: 'logo',
              type: 'upload',
              relationTo: 'images',
              admin: {
                description:
                  'Logo shown in registrant emails. Resolved to a PNG at send time — email clients render SVG poorly or not at all.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'websiteUrl',
                  type: 'text',
                  admin: { description: 'Linked from the footer of registrant emails.' },
                },
                {
                  name: 'supportEmail',
                  type: 'email',
                  admin: {
                    description:
                      'Reply-To on registrant emails, so replies reach this service rather than us.',
                  },
                },
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
              name: 'canonical',
              type: 'group',
              label: 'Canonical URLs',
              admin: {
                description:
                  'Declare that this service owns the canonical URLs for its region. At most one service per region.',
              },
              fields: [
                {
                  name: 'enabled',
                  type: 'checkbox',
                  defaultValue: false,
                  label: 'This service owns its region’s canonical URLs',
                  admin: {
                    description:
                      'Off by default, and load-bearing: several client domains are dead or on site builders, and a cross-origin iframe would name a URL that cannot restore the view. Requires a region and a canonical domain.',
                  },
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'domain',
                      type: 'text',
                      label: 'Canonical Domain',
                      validate: (value: string | null | undefined) => {
                        if (!value) return true
                        return (
                          isValidCanonicalDomain(value) ||
                          'Enter a bare host — lowercase letters, digits, dots and dashes only (no scheme, port or path).'
                        )
                      },
                      admin: {
                        description:
                          'Host only, e.g. sahajayoga.nl. Deliberately separate from Allowed Domains, which is multi-valued.',
                      },
                    },
                    {
                      name: 'mount',
                      type: 'text',
                      defaultValue: '/',
                      label: 'Mount Path',
                      admin: {
                        description:
                          'The page the embed lives on, e.g. /locatelessons/. May carry a query string — WordPress default permalinks are /?p=123.',
                      },
                    },
                  ],
                },
                {
                  name: 'routing',
                  type: 'select',
                  options: ROUTING_MODE_OPTIONS,
                  defaultValue: 'query',
                  admin: {
                    description:
                      'How the widget encodes state into the canonical URL. Hash routing is not offered — the widget is dropping it.',
                  },
                },
              ],
            },
            {
              // Observed data, not configuration — written only by
              // `POST /api/clients/report`, hence read-only here. One record per
              // mount, keyed by origin + pathname; see ./embedMetadata.ts.
              name: 'embedMetadata',
              type: 'json',
              label: 'Discovered Embeds',
              jsonSchema: {
                uri: 'https://sahajcloud.dev/schemas/client-embed-metadata.json',
                fileMatch: ['https://sahajcloud.dev/schemas/client-embed-metadata.json'],
                schema: {
                  $id: 'https://sahajcloud.dev/schemas/client-embed-metadata.json',
                  ...embedMetadataJsonSchema,
                },
              },
              admin: {
                readOnly: true,
                description:
                  'What the widget reported about each page it is installed on. Reported, never configured — the legacy hand-maintained embed type was wrong in the field.',
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
  endpoints: [clientEmbedReport],
  hooks: {
    beforeChange: [validateClientData, ensureClientId, validateCanonicalOwnership],
  },
}
