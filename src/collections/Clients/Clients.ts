import type { CollectionConfig } from 'payload'

import { colorField, legacyMigrationFields } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'
import { getRoleOptions } from '@/plugins/access'
import { calculateAbuseScore } from '@/plugins/usage'

import {
  EMBED_METADATA_SCHEMA_URI,
  EMBED_ROUTING,
  embedMetadataJsonSchema,
  type EmbedRouting,
} from './embedMetadata'
import { reportEmbedMetadata } from './endpoints/report'
import { ensureClientId } from './hooks/ensureClientId'
import {
  canonicalDomainValidate,
  validateCanonicalOwnership,
} from './hooks/validateCanonicalOwnership'
import { validateClientData } from './hooks/validateClientData'

/** Admin-facing labels for the shared routing enum. */
const ROUTING_LABELS: Record<EmbedRouting, string> = {
  query: 'Query parameter (?event=…)',
  path: 'Path segment (/event/…)',
}

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
              label: 'Canonical Ownership',
              admin: {
                description:
                  'Declares that this service owns the canonical Atlas URLs for its region. ' +
                  'Off by default, and nothing resolves differently until it is switched on.',
              },
              fields: [
                {
                  name: 'enabled',
                  type: 'checkbox',
                  defaultValue: false,
                  label: 'Owns the canonical URLs for its region',
                  admin: {
                    description:
                      'At most one service per region may own them. Requires a region and a ' +
                      'canonical domain — check the reported embeds below first: a dead domain, ' +
                      'a site builder that rewrites URLs, or a cross-origin iframe would name a ' +
                      'canonical URL that cannot restore the view.',
                  },
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'domain',
                      type: 'text',
                      // Deliberately NOT derived from `allowedDomains` — that field is a
                      // newline-separated textarea and genuinely multi-valued in the data
                      // (`sahajayoga.fr\nyogaessonne.fr`), so it cannot name a single host.
                      validate: canonicalDomainValidate,
                      admin: {
                        description: 'Host only — no scheme, no path (e.g. `sahajayoga.nl`).',
                      },
                    },
                    {
                      name: 'mount',
                      type: 'text',
                      defaultValue: '/',
                      admin: {
                        description:
                          'Page the embed lives on (e.g. `/locatelessons/`). May carry a query ' +
                          'string — WordPress default permalinks look like `/?p=123` — so the URL ' +
                          'builder joins with `&` in that case.',
                      },
                    },
                    {
                      name: 'routing',
                      type: 'select',
                      defaultValue: 'query',
                      // Exactly `query` and `path`, derived from the shared enum: hash routing
                      // is being dropped from the widget entirely, so it is never an option.
                      options: EMBED_ROUTING.map((value) => ({
                        value,
                        label: ROUTING_LABELS[value],
                      })),
                      admin: { description: 'How the widget expresses its view in the URL.' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'embedMetadata',
              label: 'Reported Embeds',
              type: 'json',
              // Payload generates the TS type from this AND compiles it to a validator that
              // runs on write, so a malformed entry throws a ValidationError instead of
              // landing in the column. Contract + merge rule live in ./embedMetadata.ts.
              jsonSchema: {
                uri: EMBED_METADATA_SCHEMA_URI,
                fileMatch: [EMBED_METADATA_SCHEMA_URI],
                schema: embedMetadataJsonSchema,
              },
              admin: {
                // Observed data, not configuration: written only by the widget via
                // POST /api/clients/report. Editing it here would just be overwritten.
                readOnly: true,
                description:
                  'What the widget reports about each page it is mounted on, keyed by origin + ' +
                  'path. Use it to decide which mount the canonical settings above should name.',
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
  endpoints: [reportEmbedMetadata],
  hooks: {
    beforeChange: [validateClientData, ensureClientId, validateCanonicalOwnership],
  },
}
