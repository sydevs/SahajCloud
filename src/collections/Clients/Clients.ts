import type { CollectionConfig } from 'payload'

import { colorField, legacyMigrationFields } from '@/fields'
import { embedMetadataJsonSchema } from '@/lib/clients/embedMetadata'
import {
  CANONICAL_VERIFICATION_SCHEMA_URI,
  canonicalVerificationJsonSchema,
} from '@/lib/clients/verification'
import { getLanguageOptions } from '@/lib/locales'
import { getRoleOptions } from '@/plugins/access'
import { calculateAbuseScore } from '@/plugins/usage'

import { clientEmbedReport } from './endpoints/report'
import { verifyEmbedOnDemand } from './endpoints/verifyEmbed'
import { ensureClientId } from './hooks/ensureClientId'
import { validateCanonicalOwnership } from './hooks/validateCanonicalOwnership'
import { validateClientData } from './hooks/validateClientData'

/**
 * Canonical ownership is one master switch: with it off the feature is off, and every field it
 * governs is hidden rather than shown inert. Shared so the fields cannot drift apart, and so
 * `required` on `embed` reads as exactly "required when canonical ownership is on".
 */
const canonicalEnabled = (data: { canonical?: { enabled?: boolean | null } | null }): boolean =>
  Boolean(data?.canonical?.enabled)

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
          label: 'Config',
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
              // The Atlas-only settings. The condition sits here rather than on the
              // tab because `name` is required and `useAsTitle` — hiding the whole tab
              // from a non-Atlas service would hide the one field every service must
              // have, and Payload skips `required` on a field behind a false condition.
              type: 'collapsible',
              label: 'Sahaj Atlas',
              admin: {
                initCollapsed: false,
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
              ],
            },
          ],
        },
        {
          label: 'SEO',
          admin: {
            condition: (data) =>
              Array.isArray(data?.roles) && data.roles.includes('sahaj-atlas-client'),
          },
          fields: [
            {
              name: 'canonical',
              type: 'group',
              label: 'Canonical Ownership',
              admin: {
                description:
                  'Declares that this service owns the canonical Atlas URLs for its region. Off by default, and nothing resolves differently until it is switched on.',
              },
              fields: [
                {
                  name: 'enabled',
                  type: 'checkbox',
                  defaultValue: false,
                  label: 'This service owns its region’s canonical URLs',
                  admin: {
                    description:
                      'At most one service per region may own them. Requires a region and one of the embeds this service has reported — the CMS then loads that page itself to confirm the widget is really there, and only a verified embed ever yields a canonical URL.',
                  },
                },
                {
                  name: 'embed',
                  type: 'text',
                  label: 'Canonical Embed',
                  // `required` + the condition below is the whole "an embed must be
                  // chosen whenever canonical ownership is on" rule: Payload skips
                  // `required` while a condition is false and enforces it when true.
                  // Same shape as `primaryContact`.
                  required: true,
                  admin: {
                    condition: canonicalEnabled,
                    components: {
                      Field: '@/components/admin/CanonicalEmbedPicker',
                      Description: '@/components/admin/CanonicalEmbedPicker/Description',
                    },
                    description:
                      'Which of the embeds this service reported owns the canonical URLs. Domain, mount and routing all come from this one choice.',
                  },
                },
                {
                  name: 'verification',
                  type: 'json',
                  label: 'Verification',
                  // Written only by the VerifyEmbeds job (and verify-on-demand) from
                  // what was observed on the live page — never by a client report, so
                  // a forged report can nominate a mount but never reshape a public URL.
                  jsonSchema: {
                    uri: CANONICAL_VERIFICATION_SCHEMA_URI,
                    fileMatch: [CANONICAL_VERIFICATION_SCHEMA_URI],
                    schema: canonicalVerificationJsonSchema,
                  },
                  admin: {
                    readOnly: true,
                    condition: canonicalEnabled,
                    description:
                      'What the CMS last confirmed by loading the page itself. Only a verified embed ever yields a canonical URL.',
                  },
                },
                {
                  name: 'nextVerifyAt',
                  type: 'date',
                  // A real indexed column, not part of the JSON above: it is the
                  // VerifyEmbeds job's only query predicate, so it has to stay cheap
                  // (the role `events.nextCheckAt` plays for ExpireEvents).
                  index: true,
                  admin: { hidden: true },
                },
              ],
            },
            {
              // Collapsed by default: evidence someone consults when deciding the
              // canonical embed above, not something they read on every visit.
              type: 'collapsible',
              label: 'Reported Embeds',
              admin: { initCollapsed: true },
              fields: [
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
          label: 'Access',
          fields: [
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
  endpoints: [clientEmbedReport, verifyEmbedOnDemand],
  hooks: {
    beforeChange: [validateClientData, ensureClientId, validateCanonicalOwnership],
  },
}
