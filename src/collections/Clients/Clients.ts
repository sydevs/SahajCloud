import type { JSONSchema4 } from 'json-schema'
import type { CollectionConfig, Field } from 'payload'

import { colorField, legacyMigrationFields } from '@/fields'
import { jsonField } from '@/fields/jsonField'
import type { RoutingMode } from '@/lib/clients/canonical'
import {
  CANONICAL_DOMAIN_PATTERN,
  ROUTING_MODE_OPTIONS,
  ROUTING_MODES,
} from '@/lib/clients/canonical'
import { embedMetadataJsonSchema } from '@/lib/clients/embedMetadata'
import {
  VERIFICATION_FAILURE_REASONS,
  VERIFICATION_INCONCLUSIVE_REASONS,
} from '@/lib/clients/verification'
import { getLanguageOptions } from '@/lib/locales'
import type { MailingListProvider } from '@/lib/mailingList/types'
import { MAILING_LIST_PROVIDERS } from '@/lib/mailingList/types'
import { getRoleOptions, managersOnlyFieldAccess } from '@/plugins/access'
import { abuseScoreSchema, calculateAbuseScore } from '@/plugins/usage'

import { clientEmbedReport } from './endpoints/report'
import { verifyEmbedOnDemand } from './endpoints/verifyEmbed'
import { ensureClientId } from './hooks/ensureClientId'
import { validateCanonicalOwnership } from './hooks/validateCanonicalOwnership'
import { validateClientData } from './hooks/validateClientData'
import { validateMailingList } from './hooks/validateMailingList'

/**
 * The bare-host rule the admin field used to enforce with
 * `canonicalDomainValidate`. It lives on the schema because the host is now
 * job-written rather than typed — the guard belongs where the write happens.
 */
const domainSchema: JSONSchema4 = {
  type: 'string',
  pattern: CANONICAL_DOMAIN_PATTERN.source,
  minLength: 1,
}

/**
 * What `canonical.verification` holds. Payload generates
 * `ClientCanonicalVerification` from this **and** compiles it to a validator
 * that runs on write; the three aliases in `@/lib/clients/verification` derive
 * from the generated type, so this shape is their single source (#671).
 *
 * **Raw JSON Schema rather than Zod**, because the shape is assembled as data:
 * three properties are `enum`s spliced from that module's exported const
 * arrays. Round-tripping those through Zod only to convert them back buys
 * nothing.
 */
const canonicalVerificationSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  required: ['verified', 'failureCount', 'attempts'],
  properties: {
    verified: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['domain', 'mount', 'widgetVersion', 'at'],
      properties: {
        domain: domainSchema,
        mount: { type: 'string' },
        // Legacy, and no longer written: the widget's own self-report, which
        // `routingProbe` replaced (#644). Kept as an optional property, not
        // deleted, because this object is closed and Payload validates it on
        // *every* save — dropping it here would make every row verified before
        // this change unsaveable until the job rewrote its snapshot.
        routing: { enum: [...ROUTING_MODES] },
        widgetVersion: { type: 'number' },
        at: { type: 'string' },
      },
    },
    failureCount: { type: 'number', minimum: 0 },
    // Optional, and outside `required` above, because this object is closed and
    // Payload validates it on *every* save of the document: a required key here
    // would strand every row written before #644. Its own inner shape is closed,
    // since `nextRoutingProbeState` is its only writer.
    routingProbe: {
      type: 'object',
      additionalProperties: false,
      required: ['at', 'verdict', 'failedAttempts'],
      properties: {
        at: { type: 'string' },
        verdict: { enum: [...ROUTING_MODES] },
        failedAttempts: { type: 'number', minimum: 0 },
      },
    },
    attempts: {
      type: 'array',
      // Deliberately no `maxItems`: json-schema-to-typescript renders a bounded
      // array as an exploded tuple union (one variant per length), which adds
      // ~200 lines to payload-types.ts for no safety we don't already have.
      // `nextVerificationState` is what trims the ring.
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['at', 'status'],
        properties: {
          at: { type: 'string' },
          status: { enum: ['verified', 'failed', 'inconclusive'] },
          reason: {
            enum: [...VERIFICATION_FAILURE_REASONS, ...VERIFICATION_INCONCLUSIVE_REASONS],
          },
        },
      },
    },
  },
}

/**
 * Canonical ownership is one master switch: with it off the feature is off, and every field it
 * governs is hidden rather than shown inert. Shared so the fields cannot drift apart, and so
 * `required` on `embed` reads as exactly "required when canonical ownership is on".
 */
const canonicalEnabled = (data: { canonical?: { enabled?: boolean | null } | null }): boolean =>
  Boolean(data?.canonical?.enabled)

/** Same master-switch shape as `canonicalEnabled`, for the mailing-list group. */
const mailingListEnabled = (data: { mailingList?: { enabled?: boolean | null } | null }): boolean =>
  Boolean(data?.mailingList?.enabled)

/** What each provider is called in the select. */
const PROVIDER_LABELS: Record<MailingListProvider, string> = {
  mailchimp: 'Mailchimp',
  brevo: 'Brevo',
  klaviyo: 'Klaviyo',
}

/**
 * What opt-in actually does, per provider — the description under the provider
 * select, switched by the chosen value (`SelectDescription`).
 *
 * **Only Mailchimp has a per-call lever**, so only Mailchimp gets the
 * `doubleOptIn` checkbox. A checkbox rendered for all three would be a promise
 * the CMS cannot keep on two of them: an operator who ticked it for Brevo
 * would believe a confirmation email was going out when none was. These two
 * notes are what stands in its place, and they are read-only because the
 * behaviour they describe is not ours to change.
 */
const OPT_IN_NOTES: Record<MailingListProvider, string> = {
  mailchimp: 'Opt-in is set per subscriber, by the checkbox below.',
  brevo:
    'Contacts are added immediately. Brevo double opt-in is not supported through this integration.',
  klaviyo: 'Governed by this list’s opt-in setting in Klaviyo, not here.',
}

/**
 * Where a client's mailing-list provider is configured.
 *
 * **Not conditioned on a role**, unlike the Sahaj Atlas collapsible above it:
 * any service, whatever it does, may run a list.
 *
 * ⚠ **Every field carries `managersOnlyFieldAccess`, and that is the security
 * boundary rather than a nicety.** Self-access lets a published key read its own
 * row whole over `GET /api/clients/me`, which no `RESTRICTED_COLLECTIONS` entry
 * covers — without the lock a service would read back its own provider secret.
 * `admin.condition` covers only the UI.
 *
 * `required` plus a false `admin.condition` is the whole "required only when
 * enabled" rule: Payload skips `required` while the condition is false. Same
 * shape as `canonical.embed`.
 */
const mailingListGroup: Field = {
  type: 'collapsible',
  label: 'Mailing List',
  admin: { initCollapsed: true },
  fields: [
    {
      name: 'mailingList',
      type: 'group',
      label: false,
      access: {
        read: managersOnlyFieldAccess,
        create: managersOnlyFieldAccess,
        update: managersOnlyFieldAccess,
      },
      admin: {
        description:
          'Where subscribe submissions relayed by this service are delivered. Off by default, and nothing is pushed anywhere until it is switched on.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: false,
          label: 'This service has a mailing list',
        },
        {
          name: 'provider',
          type: 'select',
          required: true,
          options: MAILING_LIST_PROVIDERS.map((value) => ({
            label: PROVIDER_LABELS[value],
            value,
          })),
          enumName: 'enum_clients_mailing_list_provider',
          admin: {
            condition: (data) => mailingListEnabled(data),
            // The opt-in note for the chosen provider, in place of a checkbox
            // two of the three cannot honour. See `OPT_IN_NOTES`.
            custom: { descriptions: OPT_IN_NOTES },
            components: { Description: '@/components/admin/SelectDescription' },
          },
        },
        {
          name: 'listId',
          type: 'text',
          label: 'List ID',
          required: true,
          admin: {
            condition: (data) => mailingListEnabled(data),
            // One sentence naming all three, rather than a per-provider hint:
            // `admin.description`'s function form is handed `{ i18n, t }` and
            // never the document, so it cannot see which provider is chosen.
            description:
              'Mailchimp’s Audience ID, Brevo’s numeric list id, or Klaviyo’s List ID.',
          },
        },
        {
          name: 'apiKey',
          type: 'text',
          label: 'API Key',
          required: true,
          admin: {
            condition: (data) => mailingListEnabled(data),
            description:
              'The provider secret. Checked against the provider when you save, and never readable by an API client.',
          },
        },
        {
          name: 'doubleOptIn',
          type: 'checkbox',
          defaultValue: true,
          label: 'Send a confirmation email before subscribing',
          admin: {
            // Mailchimp only — the one provider with a per-call lever.
            condition: (data) =>
              mailingListEnabled(data) && data?.mailingList?.provider === 'mailchimp',
            description:
              'Mailchimp adds the address as `pending` and emails it a confirmation link.',
          },
        },
      ],
    },
  ],
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
      // ⚠ Top level, beside `tabs`, never inside it — `mergeBaseFields` matches
      // the auth base field by name only at the level it is handed, so a nested
      // copy sanitizes to two `apiKey` fields (#822, docs/rules/access.md).
      //
      // `create` and `update` are unreachable today — no client role names
      // `clients` and #827 withdrew client self-update, so nothing untrusted
      // gets as far as field access. Kept deliberately: this is the one field
      // whose value an attacker would choose rather than read, and the grant
      // above it has already been widened once. Manager regeneration is
      // unaffected — the lock passes any `managers` caller.
      name: 'apiKey',
      type: 'text',
      access: {
        read: managersOnlyFieldAccess,
        create: managersOnlyFieldAccess,
        update: managersOnlyFieldAccess,
      },
    },
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
            mailingListGroup,
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
                jsonField({
                  name: 'verification',
                  label: 'Verification',
                  // Written only by the VerifyEmbeds job (and verify-on-demand) from
                  // what was observed on the live page — never by a client report, so
                  // a forged report can nominate a mount but never reshape a public URL.
                  schemaTitle: 'ClientCanonicalVerification',
                  schema: canonicalVerificationSchema,
                  admin: {
                    readOnly: true,
                    condition: canonicalEnabled,
                    description:
                      'What the CMS last confirmed by loading the page itself. Only a verified embed ever yields a canonical URL.',
                  },
                }),
                {
                  // How the widget should express its state in this host's URL,
                  // derived from what the probe observed (#644). Virtual: no
                  // stored column, computed on read from `verification`.
                  //
                  // It rides the `canonical` group the widget already selects
                  // (`GET /api/clients/me`), so it reaches the client with no
                  // change to the select, the endpoint, or its permissions.
                  name: 'routing',
                  type: 'select',
                  virtual: true,
                  options: ROUTING_MODE_OPTIONS,
                  label: 'Routing',
                  admin: {
                    readOnly: true,
                    condition: canonicalEnabled,
                    description:
                      'Derived, never chosen: “Path segment” once the CMS has seen this host serve the atlas under the embed’s own subtree, “Query parameter” otherwise.',
                  },
                  hooks: {
                    afterRead: [
                      ({ siblingData }) =>
                        // The one place the `query` default is applied on a read
                        // path: this hook is what the widget's `canonical.routing`
                        // comes from (#644).
                        (
                          siblingData as {
                            verification?: {
                              routingProbe?: { verdict?: RoutingMode | null } | null
                            }
                          } | null
                        )?.verification?.routingProbe?.verdict ?? 'query',
                    ],
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
                jsonField({
                  // Observed data, not configuration — written only by
                  // `POST /api/clients/report`, hence read-only here. One record per
                  // mount, keyed by origin + pathname; see ./embedMetadata.ts.
                  name: 'embedMetadata',
                  label: 'Discovered Embeds',
                  schemaTitle: 'ClientEmbedMetadata',
                  schema: embedMetadataJsonSchema,
                  admin: {
                    readOnly: true,
                    description:
                      'What the widget reported about each page it is installed on. Reported, never configured — the legacy hand-maintained embed type was wrong in the field.',
                  },
                }),
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
        jsonField({
          // Virtual: written by the hook below, never stored. The schema generates
          // `ClientAbuseScore`. See `src/collections/AGENTS.md`.
          name: 'abuseScore',
          virtual: true,
          schemaTitle: 'ClientAbuseScore',
          schema: abuseScoreSchema,
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
        }),
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
    beforeChange: [
      validateClientData,
      ensureClientId,
      validateCanonicalOwnership,
      validateMailingList,
    ],
  },
}
