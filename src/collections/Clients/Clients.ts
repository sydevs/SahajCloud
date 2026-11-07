import type { JSONSchema4 } from 'json-schema'
import type { CollectionConfig, Condition, Field, FieldAccess, PayloadRequest, Tab } from 'payload'

import { colorField, legacyMigrationFields } from '@/fields'
import { jsonField } from '@/fields/jsonField'
import { ATLAS_DEFAULT_COLORS } from '@/lib/clients/appearance'
import type { RoutingMode } from '@/lib/clients/canonical'
import {
  CANONICAL_DOMAIN_PATTERN,
  normalizeCanonicalDomain,
  ROUTING_MODE_OPTIONS,
  ROUTING_MODES,
} from '@/lib/clients/canonical'
import { embedMetadataJsonSchema, parseMountKey } from '@/lib/clients/embedMetadata'
import type { SiteFields } from '@/lib/clients/site'
import { EMBED_HEIGHTS, primaryPageUrl, SITE_TRACKS } from '@/lib/clients/site'
import {
  SEO_CHECK_IDS,
  SEO_CHECK_STATUSES,
  VERIFICATION_FAILURE_REASONS,
  VERIFICATION_INCONCLUSIVE_REASONS,
} from '@/lib/clients/verification'
import { getLanguageOptions } from '@/lib/locales'
import type { MailingListProvider } from '@/lib/mailingList/types'
import { MAILING_LIST_PROVIDER_LABELS, MAILING_LIST_PROVIDERS } from '@/lib/mailingList/types'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import {
  adminOnlyFieldAccess,
  getRoleOptions,
  isAdminManager,
  managersOnlyFieldAccess,
} from '@/plugins/access'
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
        widgetVersion: { type: 'number' },
        at: { type: 'string' },
      },
    },
    failureCount: { type: 'number', minimum: 0 },
    // When the misses released the region (#1055), so the open-items row can say
    // so: `owned` alone cannot tell a released site from one that never owned.
    // Optional for the reason `routingProbe` is, below; a success clears it.
    releasedAt: { type: 'string' },
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
    // Optional, and outside `required` above, for the same reason
    // `routingProbe` is: this object is closed and validated on every save of
    // the document, so a required key here would strand every row written
    // before #1055. Its inner shape is closed, since `nextSeoCheckState` is
    // its only writer.
    //
    // ⚠ The post-install SEO checks are a **warning channel**: a failure here
    // means the embed is present and publishing with one `<head>` field wrong,
    // never that it is gone. Nothing in this block reaches `failureCount`.
    seo: {
      type: 'object',
      additionalProperties: false,
      required: ['at', 'results'],
      properties: {
        at: { type: 'string' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['route', 'check', 'status'],
            properties: {
              route: { type: 'string' },
              check: { enum: [...SEO_CHECK_IDS] },
              status: { enum: [...SEO_CHECK_STATUSES] },
              detail: { type: 'string' },
            },
          },
        },
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
 * A row's `site` group, for the two compatibility fields below: from the read
 * itself when its `select` carried it, else one memoized read by id — the widget
 * selects `allowedDomains` and `canonical`, never `site`.
 *
 * Read without `req`: an afterRead also runs on a write's response, and a nested
 * read joining that transaction can roll the write back (`src/collections/AGENTS.md`).
 */
async function siteOf(req: PayloadRequest, data: unknown): Promise<SiteFields | null> {
  const row = data as { id?: unknown; site?: SiteFields | null } | null | undefined
  // ⚠ An unselected group arrives as `{}`, not `undefined`, so "the read carried
  // it" is a key being present, not the group.
  const carried = row?.site && (row.site.domain !== undefined || row.site.page !== undefined)
  if (carried || row?.site === null) return row?.site ?? null
  const id = row?.id
  if (typeof id !== 'number') return null
  return memoizeOnRequest(req, `clients:site:${id}`, async () => {
    const doc = await req.payload.findByID({
      collection: 'clients',
      id,
      depth: 0,
      select: { site: true },
      overrideAccess: true,
      disableErrors: true,
    })
    return (doc as { site?: SiteFields | null } | null)?.site ?? null
  })
}

/** `site.domain` is one bare host — no scheme, path, port or wildcard. */
const siteDomainValidate = (value: string | null | undefined) =>
  !value || normalizeCanonicalDomain(value) === value
    ? true
    : 'A domain is a bare host, such as sahajayoga.ca.'

/**
 * Shows the Config, Usage and Diagnostics tabs to admins alone.
 *
 * ⚠ **A false condition also skips server-side validation** — Payload runs no
 * `required` and no `validate` behind it — so a write with no user (a job, a
 * seed, an endpoint writing with `overrideAccess`) must pass, or every JSON
 * Schema and `required` check in these tabs stops running for it. A non-admin
 * manager does skip them, which is safe only because every field in these tabs
 * is admin-write-locked (`lockTabs`) or virtual: nothing a manager sends there can land.
 */
const adminTabs: Condition = (_data, _siblingData, { user }) => !user || isAdminManager(user)

/**
 * Every data field of a conditional tab, write-locked to whoever the tab is
 * shown to: an admin for the `adminTabs` ones, an admin or a service with the
 * atlas role for the Atlas tab.
 *
 * ⚠ **The lock is what makes the condition's skipped validation safe** — a
 * false condition runs no `required` and no `validate` — so it is stamped here
 * rather than written per field, and a field added to such a tab later cannot
 * ship writable, unvalidated, by a listed manager. It ANDs with a field's own
 * write rule.
 *
 * ⚠ **A rule is matched by the condition's own function reference, so a tab
 * whose condition is written inline matches nothing.** That is why an
 * unmatched conditional tab throws at config build rather than shipping
 * unlocked: there is no other signal, and the tab looks correct either way.
 */
function lockTabs(tabs: Tab[]): Tab[] {
  const and = (own: FieldAccess | undefined, rule: FieldAccess): FieldAccess =>
    own ? async (args) => (await own(args)) && (await rule(args)) : rule
  const lock =
    (rule: FieldAccess) =>
    (field: Field): Field => {
      if (field.type === 'ui') return field
      const locked = (
        'name' in field
          ? {
              ...field,
              access: {
                ...field.access,
                create: and(field.access?.create, rule),
                update: and(field.access?.update, rule),
              },
            }
          : field
      ) as Field
      return 'fields' in locked
        ? ({ ...locked, fields: locked.fields.map(lock(rule)) } as Field)
        : locked
    }
  return tabs.map((tab) => {
    if (!tab.admin?.condition) return tab
    const rule = TAB_WRITE_RULES.get(tab.admin.condition)
    if (!rule) {
      const name = 'name' in tab ? tab.name : JSON.stringify(tab.label)
      throw new Error(
        `Clients tab ${name} has an admin.condition that TAB_WRITE_RULES does not name. ` +
          'Register the condition with the write rule it implies, or move the condition to a named one.',
      )
    }
    return { ...tab, fields: tab.fields.map(lock(rule)) }
  })
}

/** A read-only usage counter, which the usage plugin writes with raw SQL. */
const usageCounter = (name: string, type: 'number' | 'date', description: string): Field =>
  type === 'number'
    ? { name, type, defaultValue: 0, admin: { readOnly: true, description } }
    : { name, type, admin: { readOnly: true, description } }

/** The Atlas-only settings, shown to a service holding the Atlas role. */
const isAtlasClient = (data: { roles?: unknown }): boolean =>
  Array.isArray(data?.roles) && data.roles.includes('sahaj-atlas-client')

/** The Atlas tab's lock: an admin, or the row's own atlas role (`roles` is admin-locked). */
const atlasWrites: FieldAccess = ({ req, doc, data }) =>
  isAdminManager(req.user) || isAtlasClient(doc ?? data ?? {})

/** Each conditional tab's write rule, keyed on the condition that hides it (`lockTabs`). */
const TAB_WRITE_RULES = new Map<Condition, FieldAccess>([
  [adminTabs, adminOnlyFieldAccess],
  [isAtlasClient, atlasWrites],
])

/** The mailing-list group's master switch. */
const mailingListEnabled = (data: { mailingList?: { enabled?: boolean | null } | null }): boolean =>
  Boolean(data?.mailingList?.enabled)

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
 * **Shown on the Atlas tab, so only to a service with the atlas role.** Delivery
 * reads a stored list whatever the roles, so a service without the role keeps
 * one it already has; it simply cannot be edited here.
 *
 * ⚠ **Every field carries `managersOnlyFieldAccess`, and that is the security
 * boundary rather than a nicety.** Self-access lets a published key read its own
 * row whole over `GET /api/clients/me`, which project membership never
 * reaches — without the lock a service would read back its own provider secret.
 * `admin.condition` covers only the UI.
 *
 * `required` plus a false `admin.condition` is the whole "required only when
 * enabled" rule: Payload skips `required` while the condition is false.
 */
const mailingListGroup: Field = {
  name: 'mailingList',
  type: 'group',
  label: 'Mailing List',
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
        label: MAILING_LIST_PROVIDER_LABELS[value],
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
        description: 'Mailchimp’s Audience ID, Brevo’s numeric list id, or Klaviyo’s List ID.',
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
        description: 'Mailchimp adds the address as `pending` and emails it a confirmation link.',
      },
    },
  ],
}

export const Clients: CollectionConfig = {
  slug: 'clients',
  auth: {
    // Payload strips a stored key from every read (3.90+), so without `reveal`
    // the admin shows a key once, at generation. Reveal is Payload's own gated
    // endpoint: admin access, then `update` on the row, then the field lock below.
    useAPIKey: { reveal: true },
    disableLocalStrategy: true, // Only API key authentication
  },
  labels: {
    singular: 'Service',
    plural: 'Services',
  },
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['name', 'enabled'],
    components: {
      views: {
        edit: {
          /**
           * The Install tab: how one non-technical volunteer gets the atlas onto
           * their own site, with this service's key and address filled in (#1055).
           *
           * ⚠ **A document view, not a root one**, which is what makes its access
           * gate the row's own. Payload only routes here with read access to the
           * document, and for `clients` that comes from the document-manager path
           * — so a manager of another service never reaches it, and
           * `requireAdminAccess` (which guards *root* views declaring a `path`)
           * is not the gate here. `InstallView` re-reads the row with
           * `overrideAccess: false` anyway, because it reveals the API key.
           *
           * Every service shows the tab; one without the atlas role has nothing
           * to install, and `InstallView` says so there.
           */
          install: {
            Component: '@/components/admin/InstallGuide/InstallView',
            path: '/install',
            tab: {
              label: 'Install',
              href: '/install',
              // 400 puts it after Payload's own Edit and API tabs.
              order: 400,
            },
          },
        },
      },
    },
  },
  // No drafts: one row per service. `enabled` is the switch a key works by
  // (`bypassPermissions`, `requireActiveClient`), so nothing about a service
  // waits on a publish, and nothing reverts what the usage plugin and the embed
  // report write straight to the row — a draft collection rebuilds every save
  // from its latest version row, which neither of those writes reaches.
  fields: [
    {
      // While the atlas install is unfinished, a banner pointing at the Install tab.
      name: 'installBanner',
      type: 'ui',
      admin: { components: { Field: '@/components/admin/InstallGuide/InstallBanner' } },
    },
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
      tabs: lockTabs([
        {
          // Operator configuration end to end, so admins only (`lockTabs`):
          // a listed manager could otherwise PATCH their key new roles,
          // themselves new co-managers, or their site a region it does not own.
          label: 'Config',
          admin: { condition: adminTabs },
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
              name: 'enabled',
              type: 'checkbox',
              defaultValue: false,
              label: 'Active',
              index: true,
              admin: { description: 'This service’s API key works only while this is on.' },
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
              label: 'Access',
              hasMany: true,
              options: getRoleOptions([
                'wemeditate-web-client',
                'wemeditate-app-client',
                'sahaj-atlas-client',
              ]),
              admin: {
                description: 'What this service’s API key may read and write, in every locale.',
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
            {
              // One column for two things, on purpose: where the map opens, and
              // the region whose atlas links this service's site may own. Empty
              // is Worldwide — the map opens on the world, and the site owns no
              // region (`sy-atlas-config`'s fallback client aside).
              name: 'region',
              type: 'relationship',
              relationTo: 'regions',
              admin: {
                condition: isAtlasClient,
                placeholder: 'Worldwide',
                description:
                  'Where the map opens, and the region whose atlas links this service’s site becomes the home for. Leave empty for a worldwide map.',
              },
            },
          ],
        },
        {
          // Unnamed groups only, so moving a field between them never moves
          // its column. Shown to a service with the atlas role alone, mailing
          // list included. Where the atlas lives is the Install tab's, shown
          // here read-only.
          label: 'Atlas',
          admin: { condition: isAtlasClient },
          fields: [
            {
              name: 'installSummary',
              type: 'ui',
              admin: {
                components: { Field: '@/components/admin/InstallGuide/InstallSummary' },
              },
            },
            {
              type: 'group',
              label: 'Brand Colors',
              admin: { description: 'How the atlas looks on this service’s site.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    colorField({
                      name: 'color1',
                      label: 'Primary Color',
                      fallback: ATLAS_DEFAULT_COLORS.color1,
                    }),
                    colorField({
                      name: 'color2',
                      label: 'Secondary Color',
                      fallback: ATLAS_DEFAULT_COLORS.color2,
                    }),
                    colorField({
                      name: 'color3',
                      label: 'Tertiary Color',
                      fallback: ATLAS_DEFAULT_COLORS.color3,
                    }),
                  ],
                },
                {
                  // One button for all three, shown while any is the service's own.
                  name: 'resetColors',
                  type: 'ui',
                  admin: {
                    components: { Field: '@/components/admin/ColorField/ResetColors' },
                  },
                },
              ],
            },
            {
              type: 'group',
              label: 'Registrant Emails',
              fields: [
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
                  name: 'supportEmail',
                  type: 'email',
                  admin: {
                    description:
                      'Reply-To on registrant emails, so replies reach this service rather than us. While this service owns its region, the emails also link to its site.',
                  },
                },
              ],
            },
            mailingListGroup,
          ],
        },
        {
          // Named: `usage.*`, in the `usage_*` columns the usage plugin's raw SQL writes.
          name: 'usage',
          label: 'Usage',
          description: 'API usage statistics',
          admin: { condition: adminTabs },
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
            usageCounter('dailyRequests', 'number', "Today's request count"),
            usageCounter('peakDailyRequests', 'number', 'Maximum historical request count'),
            usageCounter('lastRequestAt', 'date', 'Last API call timestamp'),
            // Abuse detection fields
            usageCounter('totalRequests', 'number', 'Lifetime total requests (never resets)'),
            usageCounter('highUsageDays', 'number', 'Count of days exceeding threshold'),
            usageCounter('lastHighUsageAt', 'date', 'Last date threshold was exceeded'),
            usageCounter('firstRequestAt', 'date', 'First API request (tracking start)'),
          ],
        },
        {
          // What the CMS observed, for an admin working out why a service owns
          // nothing. Every value here is written by the server, bar `owned`.
          label: 'Diagnostics',
          admin: { condition: adminTabs },
          fields: [
            {
              name: 'canonical',
              type: 'group',
              label: 'Region Ownership',
              fields: [
                {
                  // Written by the claim (the Install tab's Check) and cleared by
                  // the VerifyEmbeds job after repeated failures. An admin may
                  // release it here; `validateCanonicalOwnership` holds the rest.
                  name: 'owned',
                  type: 'checkbox',
                  defaultValue: false,
                  label: 'This service’s site is the home for its region’s atlas links',
                  index: true,
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
                {
                  // Compatibility for the widget, which still selects the
                  // primary page as `canonical.embed` (its `routing=path`
                  // prefix). Computed, never stored; removed with the
                  // SahajAtlasWeb change that reads `site` instead.
                  name: 'embed',
                  type: 'text',
                  virtual: true,
                  admin: { hidden: true },
                  hooks: { afterRead: [({ data, req }) => siteOf(req, data).then(primaryPageUrl)] },
                },
              ],
            },
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
      ]),
    },
    {
      // Where the atlas lives, owned by the Install tab — `admin.disabled`
      // keeps it out of the edit form's state, so saving the form can never
      // write back a copy older than what Install just saved.
      name: 'site',
      type: 'group',
      admin: { disabled: true },
      fields: [
        {
          // A service is one site. Its key is accepted from this host and its
          // www twin (`siteHosts`), and from no other browser origin.
          name: 'domain',
          type: 'text',
          validate: siteDomainValidate,
        },
        {
          // The primary page's path on `domain`, spelled as a report's mount key
          // spells it — so a report can match it, and it carries no markup. A
          // WordPress permalink keeps its `?p=` query, because that query is
          // the page there.
          name: 'page',
          type: 'text',
          validate: (value: string | null | undefined) => {
            if (!value) return true
            const url = `https://site.example${value}`
            const parsed = value.startsWith('/') ? parseMountKey(url) : null
            return parsed?.ok && parsed.key === url
              ? true
              : 'A page is a path, such as /classes, with no query other than a WordPress ?p=.'
          },
        },
        {
          name: 'track',
          type: 'select',
          options: SITE_TRACKS.map((value) => ({ label: value, value })),
          enumName: 'enum_clients_site_track',
        },
        {
          name: 'embedHeight',
          type: 'select',
          options: EMBED_HEIGHTS.map((value) => ({ label: value, value })),
          enumName: 'enum_clients_site_embed_height',
        },
      ],
    },
    {
      // Not `locale`: this is the service's own preferred language, not a
      // localization locale, and the old name read as one — `clients` is not a
      // localized collection (#980). Set from the Install tab.
      name: 'language',
      type: 'select',
      options: getLanguageOptions(),
      admin: { disabled: true },
    },
    {
      // Compatibility for the widget, which still reads its analytics domain
      // from the first line of `allowedDomains`. Computed from `site.domain`,
      // never stored; removed with the SahajAtlasWeb change.
      name: 'allowedDomains',
      type: 'textarea',
      virtual: true,
      admin: { disabled: true },
      hooks: {
        afterRead: [({ data, req }) => siteOf(req, data).then((site) => site?.domain ?? null)],
      },
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
