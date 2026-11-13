import type { JSONSchema4 } from 'json-schema'
import type { CollectionConfig, Condition, Field, FieldAccess, PayloadRequest, Tab } from 'payload'

import { buildRegionWebPath } from '@/collections/Regions/webPath'
import { colorField, legacyMigrationFields, secretField } from '@/fields'
import { jsonField } from '@/fields/jsonField'
import { previewTargetField } from '@/fields/previewTargetField'
import { secretFieldEndpoints } from '@/fields/secretField/endpoints'
import { ATLAS_DEFAULT_COLORS, BRAND_COLOR_LABELS } from '@/lib/clients/appearance'
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
import { serverEnv } from '@/lib/env'
import { livePreviewUrl } from '@/lib/livePreview/url'
import { getLanguageOptions } from '@/lib/locales'
import type { MailingListProvider } from '@/lib/mailingList/types'
import { MAILING_LIST_PROVIDER_LABELS, MAILING_LIST_PROVIDERS } from '@/lib/mailingList/types'
import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import {
  adminOnlyFieldAccess,
  getRoleOptions,
  isAdminManager,
  managersOnlyFieldAccess,
} from '@/plugins/access'
import { USER_EMAIL_FROM } from '@/plugins/email/senders'
import { abuseScoreSchema, calculateAbuseScore } from '@/plugins/usage'

import { atlasWrites, isAtlasClient } from './access'
import { clientEmailPreview } from './endpoints/emailPreview'
import { clientEmbedReport } from './endpoints/report'
import { verifyEmbedOnDemand } from './endpoints/verifyEmbed'
import { ensureClientId } from './hooks/ensureClientId'
import { validateCanonicalOwnership } from './hooks/validateCanonicalOwnership'
import { validateClientData } from './hooks/validateClientData'
import {
  CREDENTIAL_KEYS,
  validateMailingList,
  verifyMailingListKey,
} from './hooks/validateMailingList'

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
 * A row's `site` group, for the two compatibility fields and the `domain` column
 * below: from the read itself when its `select` carried it, else one memoized
 * read by id — the widget selects `allowedDomains` and `canonical`, never
 * `site`.
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

/** Each conditional tab's write rule, keyed on the condition that hides it (`lockTabs`). */
const TAB_WRITE_RULES = new Map<Condition, FieldAccess>([
  [adminTabs, adminOnlyFieldAccess],
  [isAtlasClient, atlasWrites],
])

/** A list exists once a provider is chosen; clearing the provider switches it off. */
const hasMailingList = (data: { mailingList?: { provider?: string | null } | null }): boolean =>
  Boolean(data?.mailingList?.provider)

/**
 * Which of the provider-specific fields each provider shows.
 *
 * A record rather than a provider comparison inside each `admin.condition`,
 * because `Condition`'s `data` is untyped: a mistyped provider literal compiles,
 * reads false, and hides the field — and with it Payload's `required`, which is
 * gated on the same condition — so the row saves with no credential at all.
 * Keyed on the derived union, so a fifth provider does not compile until it
 * answers for each field.
 */
const PROVIDER_FIELDS: Record<
  MailingListProvider,
  { clientId: boolean; doubleOptIn: boolean; doiFlowId: boolean }
> = {
  mailchimp: { clientId: false, doubleOptIn: true, doiFlowId: false },
  brevo: { clientId: false, doubleOptIn: false, doiFlowId: false },
  klaviyo: { clientId: false, doubleOptIn: false, doiFlowId: false },
  cleverreach: { clientId: true, doubleOptIn: true, doiFlowId: true },
}

/** Whether the chosen provider shows one of those fields. */
const providerShows = (
  data: { mailingList?: { provider?: string | null } | null },
  field: keyof (typeof PROVIDER_FIELDS)[MailingListProvider],
): boolean => {
  const provider = data?.mailingList?.provider
  return Boolean(provider && PROVIDER_FIELDS[provider as MailingListProvider]?.[field])
}

/**
 * How to set each provider up, under the provider select (`SelectDescription`):
 * where its List ID and key live, and what it does about confirmation emails.
 *
 * **Only Mailchimp and CleverReach have a per-call opt-in lever**
 * (`PROVIDER_FIELDS`), so only those two get the confirmation checkbox. For the
 * other two this text is what stands in its place — a checkbox the CMS cannot
 * honour would be a promise it breaks.
 */
const PROVIDER_SETUP: Record<MailingListProvider, string> = {
  mailchimp:
    'In Mailchimp, find the Audience ID under Audience → Settings, and create an API key under Profile → Extras → API keys.',
  brevo:
    'In Brevo, find the list’s ID under Contacts → Lists, and create an API key under SMTP & API. Brevo adds people straight away, with no confirmation email.',
  klaviyo:
    'In Klaviyo, find the List ID in the list’s settings, and create a private API key under Settings → API keys. Confirmation emails are set on the list in Klaviyo.',
  cleverreach:
    'In CleverReach, open Account → Extras → REST API and create an app. Copy its Client ID here and use its Client Secret as the API key. The List ID is your group’s ID.',
}

/**
 * Where a client's mailing-list provider is configured. Choosing a provider is
 * what turns the list on.
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
 * `required` plus a false `admin.condition` is the whole "required once a
 * provider is chosen" rule: Payload skips `required` while the condition is false.
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
    description: 'Add people who sign up for news on this site to your own mailing list.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'provider',
          type: 'select',
          label: 'Mailing List Provider',
          options: MAILING_LIST_PROVIDERS.map((value) => ({
            label: MAILING_LIST_PROVIDER_LABELS[value],
            value,
          })),
          enumName: 'enum_clients_mailing_list_provider',
          admin: {
            // Half the row beside CleverReach's Client ID; the whole row when that is hidden.
            width: '50%',
            style: { flexGrow: 1 },
            description: 'Leave empty if this service has no mailing list.',
            custom: { descriptions: PROVIDER_SETUP },
            components: { Description: '@/components/admin/SelectDescription' },
          },
        },
        {
          name: 'clientId',
          type: 'text',
          label: 'Client ID',
          required: true,
          admin: {
            width: '50%',
            condition: (data) => providerShows(data, 'clientId'),
            description: 'From your CleverReach app.',
          },
        },
      ],
    },
    {
      name: 'listId',
      type: 'text',
      label: 'List ID',
      required: true,
      admin: {
        condition: (data) => hasMailingList(data),
        description: 'The list new subscribers are added to.',
      },
    },
    ...secretField({
      name: 'apiKey',
      label: 'API Key',
      writeAccess: managersOnlyFieldAccess,
      verify: verifyMailingListKey,
      dependsOn: CREDENTIAL_KEYS.filter((key) => key !== 'apiKey'),
      setDescription: 'We check this key with your mailing list provider first.',
      admin: { condition: (data) => hasMailingList(data) },
    }),
    {
      name: 'doubleOptIn',
      type: 'checkbox',
      defaultValue: true,
      label: 'Email a confirmation link first',
      admin: {
        condition: (data) => providerShows(data, 'doubleOptIn'),
        description: 'People are only added after they click the link in that email.',
      },
    },
    {
      name: 'doiFlowId',
      type: 'text',
      label: 'Confirmation flow ID',
      required: true,
      admin: {
        condition: (data) =>
          providerShows(data, 'doiFlowId') && data?.mailingList?.doubleOptIn !== false,
        description: 'The CleverReach form that sends the confirmation email. Copy its Flow ID.',
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
    useAsTitle: 'label',
    defaultColumns: ['label', 'domain', 'enabled'],
    /**
     * The service's own atlas, so a manager sees their colours and logo on the
     * real map while they choose them (#1110).
     *
     * ⚠ **Through `livePreviewUrl`, never a bare URL** — a falsy one persists
     * "closed" as that editor's preference for the whole collection
     * (`src/lib/livePreview/unavailable.ts`).
     *
     * ⚠ **A region change re-resolves this and reloads the panel.** Accepted:
     * only an admin sets `region`, and only on the Config tab.
     */
    livePreview: {
      breakpoints: [{ label: 'Mobile', name: 'mobile', width: 390, height: 844 }],
      url: async ({ data, locale, req }) =>
        livePreviewUrl({
          base: serverEnv.SAHAJATLAS_URL,
          params: { locale: locale.code, scope: 'clients' },
          // Worldwide, or a region with no path of its own, is the atlas root.
          path: isAtlasClient(data ?? {})
            ? ((await buildRegionWebPath({ data: { id: relationId(data?.region) }, req })) ?? '')
            : null,
          reason: 'no-atlas-role',
        }),
    },
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
            previewTargetField(
              { autoClose: true, unavailable: 'atlas-tab-only' },
              'config__preview_target',
            ),
            {
              name: 'label',
              type: 'text',
              required: true,
              label: 'Internal Name',
              admin: {
                description:
                  'How this service is known inside SahajCloud. Never shown to the public.',
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
          // Shown to a service with the atlas role alone, mailing list included.
          // Where the atlas lives is the Install tab's, shown here read-only.
          label: 'Atlas',
          admin: { condition: isAtlasClient },
          fields: [
            previewTargetField({ autoOpen: true }, 'atlas__preview_target'),
            {
              name: 'installSummary',
              type: 'ui',
              admin: {
                components: { Field: '@/components/admin/InstallGuide/InstallSummary' },
              },
            },
            {
              // Optional: `clientPublicTitle` falls back to `site.domain` at read
              // time rather than copying it in, so a later domain change is not
              // frozen behind a stale title.
              name: 'title',
              type: 'text',
              label: 'Public Title',
              admin: {
                description:
                  'The name registrants see, e.g. in their confirmation emails. Leave empty to use the site’s domain.',
              },
            },
            {
              name: 'supportEmail',
              type: 'email',
              admin: {
                description:
                  'This sets the Reply-To on registration emails, so replies reach you instead of us.',
                // What a reply reaches with this left empty: the message's own sender.
                placeholder: USER_EMAIL_FROM,
              },
            },
            {
              name: 'logo',
              type: 'upload',
              relationTo: 'images',
              admin: {
                description: 'Logo shown in registrant emails.',
              },
            },
            {
              // Unnamed, so it groups the pickers on screen and stores nothing of its own:
              // the colours stay top-level `color1`–`color3`.
              type: 'group',
              label: 'Branding Colors',
              admin: {
                components: { Label: '@/components/admin/AtlasPreview/BrandingColorsLabel' },
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    colorField({
                      name: 'color1',
                      label: BRAND_COLOR_LABELS.color1,
                      fallback: ATLAS_DEFAULT_COLORS.color1,
                    }),
                    colorField({
                      name: 'color2',
                      label: BRAND_COLOR_LABELS.color2,
                      fallback: ATLAS_DEFAULT_COLORS.color2,
                    }),
                    colorField({
                      name: 'color3',
                      label: BRAND_COLOR_LABELS.color3,
                      fallback: ATLAS_DEFAULT_COLORS.color3,
                    }),
                  ],
                },
                {
                  // What the preview reports it rendered. Stores nothing.
                  name: 'adjustedColors',
                  type: 'ui',
                  admin: {
                    components: { Field: '@/components/admin/AtlasPreview/AdjustedColors' },
                  },
                },
                {
                  // The preview's light or dark look. Stores nothing.
                  name: 'mapPreview',
                  type: 'ui',
                  admin: {
                    components: { Field: '@/components/admin/AtlasPreview/MapPreviewField' },
                  },
                },
                {
                  // The one thing a visitor receives that this branding reaches.
                  name: 'emailPreview',
                  type: 'ui',
                  admin: {
                    components: { Field: '@/components/admin/AtlasPreview/EmailPreviewField' },
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
            previewTargetField(
              { autoClose: true, unavailable: 'atlas-tab-only' },
              'usage__preview_target',
            ),
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
            previewTargetField(
              { autoClose: true, unavailable: 'atlas-tab-only' },
              'diagnostics__preview_target',
            ),
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
      // A list column alone: `site` is `admin.disabled`, so it cannot be one
      // itself. The form shows the domain in the Atlas tab's install summary,
      // and a false `condition` hides the field there without dropping the
      // column, which `admin.hidden` would.
      name: 'domain',
      type: 'text',
      label: 'Domain',
      virtual: true,
      admin: { readOnly: true, condition: () => false },
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
  endpoints: [
    clientEmailPreview,
    clientEmbedReport,
    verifyEmbedOnDemand,
    ...secretFieldEndpoints('clients'),
  ],
  hooks: {
    beforeChange: [
      validateClientData,
      ensureClientId,
      validateCanonicalOwnership,
      validateMailingList,
    ],
  },
}
