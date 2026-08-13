import type { CollectionConfig } from 'payload'

import {
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { email, text } from 'payload/shared'

import {
  DEFAULT_REGISTRATION_FREQUENCY,
  REGISTRATION_OVERRIDE_FREQUENCY_OPTIONS,
} from '@/components/admin/NotificationPreferences/config'
import {
  addressFields,
  hideUntilCreated,
  legacyMigrationFields,
  publicUrlFields,
  scheduleFields,
  urlField,
} from '@/fields'
import { getRegionWebPaths } from '@/lib/atlas/regionWebPaths'
import { revalidateAtlasSidebarHook } from '@/lib/atlasSidebar/cache'
import { serverEnv } from '@/lib/env/server'
import { EVENT_QUALITY_CHECK_METADATA, SKIP_REASON_LABELS } from '@/lib/eventQuality'
import {
  DEFAULT_VERIFICATION_STAGE,
  isPreAdoptionStage,
  isUnmanagedStage,
} from '@/lib/eventVerification/stages'
import { getLanguageOptions } from '@/lib/locales'
import { EVENT_REGISTRATION_QUESTIONS } from '@/lib/registrations/questions'
import { adminOnlyCondition, ownedRegionFilterOptions } from '@/plugins/access'
import { relationId } from '@/plugins/access/documentManagers'

import { eventsGeoJson } from './endpoints/geojson'
import { registerForEvent } from './endpoints/registerForEvent'
import { verifyEventAction } from './endpoints/verifyEventAction'
import {
  EVENT_REGISTRATION_MODE_OPTIONS,
  EVENT_TYPE_OPTIONS,
  VERIFICATION_STAGE_OPTIONS,
} from './eventOptions'
import { ensureWebPathDeps } from './hooks/ensureWebPathDeps'
import { computeEventQualityReport, stampEventQuality } from './hooks/eventQuality'
import { eventTitleBeforeChange, eventTitleValidate } from './hooks/eventTitle'
import { excludeFinishedEvents } from './hooks/excludeFinishedEvents'
import { syncEventFullness } from './hooks/syncFullness'
import { syncVerificationOnSave } from './hooks/syncVerificationOnSave'

const TOGGLE_GROUP_FIELD = '@/components/admin/ToggleGroupField'

/** Bound on the free-text contact fields — matches the address fields' limit. */
const CONTACT_TEXT_MAX = 100
/** Bound on a contact email address (the RFC 5321 maximum). */
const CONTACT_EMAIL_MAX = 254

/**
 * Minimal rich-text editor for the event description: italic, an H3,
 * links, and the inline toolbar — nothing heavier.
 */
const eventDescriptionEditor = lexicalEditor({
  features: () => [
    ItalicFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h3'] }),
    LinkFeature(),
    InlineToolbarFeature(),
  ],
})

/**
 * Events — Sahaj Atlas events (offline meetups + online sessions), migrated
 * from the Atlas `events` table. Drafts replace Atlas's `published` boolean
 * (Payload owns the publish control). The schedule lives in the project
 * `scheduleFields` (which also stores the timezone on its First Date & Time);
 * Atlas `finishDate` maps into its ending (not a standalone field).
 *
 * **Finished-event read contract (for `sahaj-atlas-client`).** When an event's
 * schedule runs out, the ExpireEvents job marks it `finished` but leaves it
 * **published** (#603, see `finishEvent`): its Atlas page must keep resolving
 * for a late seeker following an old link, and `webPath`/`webUrl` are
 * publish-gated. So `GET /api/events/:id` stays readable and the widget renders
 * an "Ended" panel — while the public *feeds* drop it (`GET /api/events` for
 * clients and `GET /api/events/geojson`) via `excludeFinishedEvents` /
 * `notFinishedWhere`. The pinned contract: finished ⇒ readable by id, absent
 * from the feeds.
 *
 * Registration is refused for a finished (or otherwise elapsed) event by the
 * register endpoint's gate (`event_ended`), so the read staying open can't leak
 * a registration into an event that is really over.
 */
export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Event', plural: 'Events' },
  versions: { drafts: true },
  // Soft-delete: "archiving" a long-expired event = trashing it (recoverable
  // from the admin trash view) — replaces Atlas's `archived` terminal.
  trash: true,
  // The listing-quality report costs two extra reads to compute, and nothing
  // hydrating an Event through a relationship (a Registration, the sidebar)
  // wants it. Its `afterRead` also opts out of list reads — see the field.
  defaultPopulate: { qualityReport: false },
  admin: {
    group: 'Classes',
    useAsTitle: 'title',
    defaultColumns: ['title', 'verificationStage', '_status'],
    // Live Preview loads the Atlas widget's /preview route. Unlike WeMeditate's
    // server-side preview, the widget fetches the doc back **client-side**,
    // forwarding the secret in the x-sahajcloud-preview-secret header — which
    // unlocks drafts (see @/lib/utilities/previewSecret) and must clear CORS
    // preflight (see `cors` in payload.config.ts). `locale` rides along so the
    // widget renders its own chrome in the edited locale — the event's title is
    // one non-localized value, which the widget translates client-side.
    livePreview: {
      // No URL for an unsaved doc (nothing to fetch yet) — null disables the panel.
      url: ({ data, locale }) =>
        data.id
          ? `${serverEnv.SAHAJATLAS_URL}/preview?collection=events&id=${data.id}&secret=${serverEnv.SAHAJCLOUD_PREVIEW_SECRET}&locale=${locale.code}`
          : null,
      // Phone-sized frame for the widget's bottom-sheet drawer layout.
      breakpoints: [{ label: 'Mobile', name: 'mobile', width: 390, height: 844 }],
    },
  },
  // Re-verify on any manager save; the explicit POST endpoint backs the notice
  // banner's Verify button. The tokenized email link is the `/events/verify`
  // frontend page (it calls the shared verify op via a Server Action).
  hooks: {
    // Keep `webPath`/`webUrl` resolvable when a read selects them without their
    // inputs (`region`, and `_status` for `webUrl`) — see ensureWebPathDeps.
    // Then drop finished events from API-client list reads (they stay published
    // so their pages resolve, but shouldn't be listed) — see excludeFinishedEvents.
    beforeOperation: [ensureWebPathDeps, excludeFinishedEvents],
    // syncVerificationOnSave first — it decides the stage this save lands on
    // (verify, or just re-arm the pre-adoption watermark). Both stamping hooks
    // must run after it: `syncEventFullness` writes `registrationsFull`, and
    // `stampEventQuality`'s skip rules read `verificationStage`.
    beforeChange: [syncVerificationOnSave, syncEventFullness, stampEventQuality],
    // Bust the Atlas manager sidebar cache (event list + region counts) whenever
    // an event changes or is trashed/restored.
    afterChange: [revalidateAtlasSidebarHook],
    afterDelete: [revalidateAtlasSidebarHook],
  },
  endpoints: [verifyEventAction, eventsGeoJson, registerForEvent],
  fields: [
    {
      // Contextual banner above the tabs: warns when the event is due for or
      // past verification and offers a Verify button (the explicit endpoint).
      // Renders nothing for a freshly verified or unsaved event.
      name: 'verificationNotice',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/admin/EventVerificationNotice',
        },
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
          fields: [
            {
              // Primary event name + useAsTitle. **Not localized** — the Atlas
              // widget translates the title client-side, so one stored value in
              // the default locale is the whole story here. A beforeChange hook
              // fills an empty one from the venue (see ./hooks/eventTitle).
              name: 'title',
              type: 'text',
              required: true,
              // Matches the address fields' limit. The longest title in the
              // Atlas data is 94 characters and nothing exceeds 100, so this
              // binds new writing without locking anyone out of a listing they
              // already have. `maxLength` is Payload validation, not a column
              // width, so it needs no migration.
              maxLength: 100,
              validate: eventTitleValidate,
              hooks: { beforeChange: [eventTitleBeforeChange] },
              admin: {
                placeholder: 'Meditation at …',
                description:
                  'Up to 100 characters. Leave blank to fill in from the venue — "Evening Meditation at Broadstairs Friends Meeting House" — which also translates itself into every language.',
              },
            },
            {
              name: 'languages',
              type: 'select',
              hasMany: true,
              required: true,
              options: getLanguageOptions(),
              admin: { description: 'Language(s) this event is conducted in.' },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'contactPhone',
                  label: 'Contact Phone Number',
                  type: 'text',
                  maxLength: CONTACT_TEXT_MAX,
                  // Inactive events have no schedule, so a *reachable person* is
                  // the only way a seeker can find out more — an inactive event
                  // must carry one. A phone or an email satisfies it; a website
                  // deliberately does not, because a page is metadata about the
                  // event rather than a route to someone who can answer a
                  // question (same for `onlineUrl`, a join link for sessions an
                  // inactive event isn't running). Always visible, so this can't
                  // gate on an `admin.condition`; a validate keeps active events
                  // optional.
                  //
                  // Composed with `text` from payload/shared because supplying
                  // `validate` REPLACES Payload's default, which would otherwise
                  // silently drop `maxLength` — see .claude/rules/collections.md.
                  validate: (
                    value: string | null | undefined,
                    options: { data?: { inactive?: boolean; contactEmail?: string | null } },
                  ) => {
                    const base = text(value, options as Parameters<typeof text>[1])
                    if (base !== true) return base
                    return options.data?.inactive && !value && !options.data.contactEmail
                      ? 'Add a phone number or an email address — an inactive event has no schedule, so this is the only way a seeker can reach you.'
                      : true
                  },
                  admin: {
                    description:
                      'A phone number that seekers can call to learn more about the program.',
                  },
                },
                {
                  name: 'contactEmail',
                  type: 'email',
                  // An `email` field validates format but takes no `maxLength`
                  // of its own, so without this it's unbounded on a public-
                  // facing listing. Composed with `email` from payload/shared
                  // for the same reason as the phone above: a custom `validate`
                  // replaces the built-in check, so it has to re-run it before
                  // adding the bound.
                  //
                  // Deliberately does NOT repeat the inactive-contact rule —
                  // either field satisfies it, and asserting it here too would
                  // surface the same complaint on two fields at once.
                  validate: (
                    value: string | null | undefined,
                    options: Parameters<typeof email>[1],
                  ) => {
                    const base = email(value, options)
                    if (base !== true) return base
                    return !value || value.length <= CONTACT_EMAIL_MAX
                      ? true
                      : `Keep the email address under ${CONTACT_EMAIL_MAX} characters.`
                  },
                  admin: {
                    description:
                      'An email address seekers can write to for more information about the program.',
                  },
                },
                {
                  name: 'contactName',
                  type: 'text',
                  maxLength: CONTACT_TEXT_MAX,
                  // Shown once there's a contact route to put a name to —
                  // whoever answers the phone or reads the inbox. Not
                  // *required*: the Atlas dump holds numbers and addresses with
                  // no name against them, and refusing those threw away the only
                  // contact route a dormant listing had. A nicety, not a
                  // necessity.
                  admin: {
                    condition: (data) => !!data?.contactPhone || !!data?.contactEmail,
                    description: 'The name of the person seekers will reach',
                  },
                },
              ],
            },
            {
              name: 'description',
              type: 'richText',
              editor: eventDescriptionEditor,
            },
            urlField({
              name: 'website',
              label: 'Website',
              admin: {
                description: 'Link to a page with more information about this class.',
              },
            }),
            {
              name: 'images',
              type: 'upload',
              relationTo: 'images',
              hasMany: true,
              maxRows: 7,
              admin: { description: 'Photos for this event (up to 7).' },
            },
            // Canonical Atlas web path/URL: the event's region path + `/<id>`
            // (`/belgium/flanders/antwerp/downtown-hall/12345`). Publish-gated —
            // an unpublished event has no public page, and the verify/reminder
            // links + ExpireEvents job rely on that null-on-unpublish contract
            // (`appUrl` is always null — there's no Atlas app deep-link).
            // `region` (an id at depth 0) must be present for the path to
            // resolve; the ensureWebPathDeps beforeOperation hook keeps it
            // selectable on its own.
            ...publicUrlFields({
              web: serverEnv.SAHAJATLAS_URL,
              buildPath: async ({ data, req }) => {
                const regionId = relationId(data?.region)
                const id = data?.id
                if (regionId == null || typeof id !== 'number') return null
                const regionPath = (await getRegionWebPaths(req)).get(regionId)
                return regionPath != null ? `${regionPath}/${id}` : null
              },
            }),
          ],
        },
        {
          label: 'Location',
          fields: [
            {
              name: 'region',
              type: 'relationship',
              label: 'City / Venue',
              relationTo: 'regions',
              required: true,
              filterOptions: async (args) => {
                // City/venue only, and — for an atlas-manager — within their
                // owned-region subtree.
                const cityOrVenue = { level: { in: ['city', 'venue'] } }
                const owned = await ownedRegionFilterOptions(args)
                if (owned === true) return cityOrVenue
                if (owned === false) return false
                return { and: [cityOrVenue, owned] }
              },
              admin: { description: 'The city or venue this event belongs to.' },
            },
            {
              name: 'eventType',
              type: 'select',
              required: true,
              defaultValue: 'offline',
              options: [...EVENT_TYPE_OPTIONS],
              admin: { components: { Field: TOGGLE_GROUP_FIELD } },
            },
            urlField({
              name: 'onlineUrl',
              label: 'Online URL',
              required: true,
              admin: {
                condition: (data) => data?.eventType === 'online',
                description: 'Link attendees join the online event through.',
              },
            }),
            addressFields({
              label: false,
              required: ['street', 'city', 'country', 'latitude', 'longitude'],
              // The building's name is what a seeker recognises, and it's what
              // the title auto-fill prefers over the street — see eventTitle.ts.
              hasVenueName: true,
              admin: { condition: (data) => data?.eventType === 'offline' },
            }),
          ],
        },
        {
          label: 'Schedule',
          fields: [
            {
              // Dormant events have no active schedule. They still require
              // verification (and can expire), but never auto-`finished` — the
              // ExpireEvents finished-check skips inactive events. Hiding the
              // schedule when inactive also drops its `required` validation
              // (Payload skips required + validate when a condition is false).
              name: 'inactive',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                description:
                  'Mark this event dormant — it has no active schedule. With no schedule to show, you must provide contact info (phone + name) so seekers can reach out and find out more. Inactive events still need verification but never auto-finish.',
              },
            },
            scheduleFields({
              label: false,
              required: true,
              hasComplexWeekly: true,
              hasComplexMonthly: true,
              hasEndTime: true,
              hasEnding: true,
              hasExclusions: true,
              admin: { condition: (data) => !data?.inactive },
            }),
          ],
        },
        {
          label: 'Registration',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'registrationMode',
                  type: 'select',
                  required: true,
                  defaultValue: 'sahaj-atlas',
                  options: [...EVENT_REGISTRATION_MODE_OPTIONS],
                  admin: { components: { Field: TOGGLE_GROUP_FIELD } },
                },
                urlField({
                  name: 'externalRegistrationUrl',
                  label: 'External Registration URL',
                  admin: {
                    condition: (data) => data?.registrationMode === 'external',
                  },
                }),
                {
                  name: 'registrationLimit',
                  type: 'number',
                  min: 0,
                  admin: {
                    description: 'Maximum registrations (blank = unlimited).',
                    condition: (data) => data?.registrationMode === 'sahaj-atlas',
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'registrationNotificationEmail',
                  label: 'Send Registration Updates To',
                  // Built-in email format validation — no hand-rolled validator.
                  type: 'email',
                  admin: {
                    // Hidden pre-adoption: an unverified/denied event has no
                    // manager, and its registrations are recorded but forwarded
                    // to nobody until a manager adopts it.
                    condition: (data) =>
                      data?.registrationMode === 'sahaj-atlas' &&
                      !isPreAdoptionStage(data?.verificationStage),
                    placeholder: 'Event Manager',
                    description:
                      'Enter an email to redirect updates about new seeker registrations to. Leave blank to send registration updates to the event manager.',
                  },
                },
                {
                  name: 'registrationNotificationFrequency',
                  label: 'How Often',
                  type: 'select',
                  // Options derived from NOTIFICATION_TYPES' `event_registration` entry so
                  // the two surfaces can't drift; summary cadences are omitted until the
                  // digest run exists (see #588 §4). Immediate is the default, matching
                  // buildDefaultNotificationPreferences.
                  defaultValue: DEFAULT_REGISTRATION_FREQUENCY,
                  options: [...REGISTRATION_OVERRIDE_FREQUENCY_OPTIONS],
                  // Pin the enum name so it stays stable across migrations (mirrors
                  // verificationStage) and never collides with drafts' `_status` enum.
                  enumName: 'enum_events_registration_notification_frequency',
                  admin: {
                    condition: (data) => Boolean(data?.registrationNotificationEmail),
                  },
                },
              ],
            },
            {
              name: 'registrationQuestions',
              type: 'group',
              admin: {
                description:
                  'Optional questions to ask registrants — each enabled question appears on the registration form.',
              },
              fields: EVENT_REGISTRATION_QUESTIONS.map((question) => ({
                name: question.name,
                type: 'checkbox' as const,
                label: question.label,
              })),
            },
            {
              name: 'registrations',
              type: 'join',
              collection: 'registrations',
              on: 'event',
              admin: { condition: hideUntilCreated },
            },
          ],
        },
        {
          label: 'Verification',
          fields: [
            {
              // Tutorial banner explaining the verification lifecycle, shown above
              // the manager + stage tracker. Generic InfoBanner (icon/title/text
              // via `custom`) — see @/components/admin/InfoBanner.
              name: 'verificationGuide',
              type: 'ui',
              admin: {
                custom: {
                  icon: 'tutorial',
                  title: 'How verification works',
                  text: 'Public events are re-verified periodically so the map stays accurate. If an event isn’t re-verified in time, its manager — then the region managers above it — are reminded, and it’s eventually unpublished. Saving or publishing the event re-verifies it and restarts this cycle.',
                },
                components: { Field: '@/components/admin/InfoBanner' },
              },
            },
            {
              name: 'manager',
              type: 'relationship',
              relationTo: 'managers',
              // Conditionally required, not `required: true`: the pre-adoption
              // stages (`unverified` / `denied`) have no manager by definition,
              // and the field must stay *visible* there — assigning a manager
              // and saving is exactly how those events are adopted (the
              // save hook then flips the stage to `verified`). Every
              // ladder stage still demands one: verified implies managed.
              // `finished` is also exempt — the stale sweep finishes run-out
              // unverified events that never got adopted, and a terminal stage
              // sends no reminders for a manager to receive.
              validate: (
                value: unknown,
                { data }: { data?: { verificationStage?: string | null } },
              ) => {
                const stage = data?.verificationStage
                return value || stage == null || isUnmanagedStage(stage)
                  ? true
                  : 'A manager is required — only unverified, denied or finished events can be unmanaged.'
              },
              admin: {
                description:
                  'Manager responsible for verifying this event. Assigning one to an unverified event adopts it into the verification cycle.',
              },
            },
            {
              name: 'verificationStage',
              label: 'Verification Process',
              type: 'select',
              required: true,
              defaultValue: DEFAULT_VERIFICATION_STAGE,
              options: [...VERIFICATION_STAGE_OPTIONS],
              // System-managed: advanced by the ExpireEvents job, reset to
              // `verified` by the verify op. `enumName` is pinned so it never
              // collides with drafts' `_status` enum (`enum_events_status`).
              enumName: 'enum_events_verification_stage',
              admin: {
                readOnly: true,
                components: { Field: '@/components/admin/VerificationStageField' },
              },
            },
            {
              // Current cycle's ledger: the verification that opened it plus a
              // reminder entry per send. Reset on every verification, and the
              // job's exactly-once marker (skip recipients already logged this
              // stage). Read-only, rendered by NotificationLogTable.
              name: 'notificationLog',
              type: 'json',
              admin: {
                readOnly: true,
                description:
                  'Current verification cycle — the verification that opened it plus each reminder sent. Reset on every verification.',
                components: { Field: '@/components/admin/NotificationLogTable' },
              },
            },
            {
              // Wilson lower bound of registrant confirm/deny votes, in [0, 1];
              // null until the first vote. A real, indexed column — unlike the
              // raw tallies in `systemMeta` — because the Atlas feeds sort and
              // filter on it to rank unverified listings by confidence. Written
              // only by the Registrations vote-sync hook.
              //
              // Shown only while `unverified`: that's the one stage where votes
              // are still being collected (the gate closes at `denied`, and an
              // adopted event is vouched for by a manager instead), so anywhere
              // else the number is a stale artefact rather than information.
              name: 'confidenceScore',
              label: 'Community Confidence',
              type: 'number',
              index: true,
              admin: {
                readOnly: true,
                condition: (data) => data?.verificationStage === 'unverified',
                description:
                  'How strongly attendees confirm this event is real (0–1). Rises with confirmations, falls with denials, and stays cautious while there are few votes — the Atlas map ranks unverified listings by it. Blank until the first vote.',
              },
            },
          ],
        },
      ],
    },
    {
      // Advisory listing-quality recommendations (#609), in the sidebar above
      // Legacy Data. Computed on read, so opening the event is already fresh —
      // there is deliberately no refresh control, which would have to re-save
      // the document and churn `updatedAt` and the version history.
      //
      // NOT localized: `description`/`images`/`website` aren't, and the
      // per-locale tier's whole job is answering "which of my languages is
      // missing a title" — which a localized field, returning only the active
      // locale, structurally cannot do.
      name: 'qualityReport',
      type: 'json',
      virtual: true,
      label: false,
      admin: {
        position: 'sidebar',
        readOnly: true,
        components: { Field: '@/components/admin/EventQualityPanel' },
        // Labels live with the check definitions, so the code stays the
        // single source of truth and a new check can't ship unlabelled.
        custom: {
          checksMetadata: EVENT_QUALITY_CHECK_METADATA,
          skipReasonLabels: SKIP_REASON_LABELS,
        },
      },
      hooks: { afterRead: [computeEventQualityReport] },
    },
    {
      // Every machine-maintained value on the document, in one collapsed
      // drawer. None of these are editable — they're written by hooks and the
      // nightly job — but hiding them outright (as they were) meant the only
      // way to see why an event behaved as it did was to query the database.
      label: 'System',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          // Who sent this listing in: the registrant record upserted by the
          // public submission flow (or the system user for bulk imports).
          // Record-keeping/abuse tracking only — grants no access.
          name: 'submitter',
          type: 'relationship',
          relationTo: 'users',
          admin: {
            readOnly: true,
            description: 'Who submitted this listing (record-keeping only).',
          },
        },
        {
          // `should_update_status_at` analog the job filters on
          // (`nextCheckAt <= now`) — the watermark that makes every lifecycle
          // transition reachable. See @/lib/eventVerification/watermark.
          name: 'nextCheckAt',
          type: 'date',
          // Indexed: the daily ExpireEvents sweep selects on
          // `nextCheckAt <= now`, so this is the one column it filters on.
          index: true,
          admin: {
            readOnly: true,
            description: 'When the nightly job will next act on this event.',
          },
        },
        {
          // Denormalized "at capacity" flag the Atlas widget reads to render
          // its "Full" registration state. A boolean — never a raw count — so a
          // public `sahaj-atlas-client` can select fullness without learning
          // exact registration numbers. Stored (not computed per read) so the
          // geojson feed and list reads stay O(1): maintained by the
          // Registrations create/delete hooks (`syncEventRegistrationsFull`)
          // and recomputed here on a registrationMode / registrationLimit
          // change (`syncEventFullness` beforeChange). True only for
          // `sahaj-atlas` mode with a set limit the registration count has
          // reached; false for `external` mode or a blank (unlimited) limit.
          name: 'registrationsFull',
          type: 'checkbox',
          defaultValue: false,
          admin: { readOnly: true, description: 'Registrations have reached the limit.' },
        },
        {
          // Open document-scope items, for list-view sorting and targeted
          // queries. A query pre-filter, not a score: the per-locale checks read
          // localized titles a write hook can't see, so a single non-localized
          // column cannot hold a correct cross-locale figure.
          name: 'qualityOpenCount',
          type: 'number',
          index: true,
          admin: { readOnly: true, description: 'Open listing-quality recommendations.' },
        },
        {
          // Which definition of the check set produced `qualityOpenCount`, so a
          // stored count stays comparable across deploys. Stamped on every
          // write; nothing re-stamps in bulk (production is seeded by the Atlas
          // import, which writes through the same hook).
          name: 'qualityCheckVersion',
          type: 'number',
          admin: { readOnly: true, description: 'Check-set version the count was stamped from.' },
        },
        {
          // Namespaced grab-bag for system-managed, non-editable, NON-INDEXABLE
          // event metadata — add keys here, not columns. Today:
          // `communityFeedback: { confirmations, denials, updatedAt }`,
          // maintained by the Registrations vote-sync hook alongside
          // `confidenceScore` (which stays a real column only because feeds
          // sort on it). Anything needing a `where` or an index does NOT belong
          // in here.
          name: 'systemMeta',
          type: 'json',
          // Never writable through the API, by anyone. The system writers (the
          // vote-sync hook, the job, the importer) all pass `overrideAccess`,
          // which skips field access entirely — while for everyone else Payload
          // *deletes the key from the incoming patch* rather than nulling the
          // column (beforeValidate/promise.js), so an admin-panel save can
          // never clear it. That's what makes hiding it below safe: visibility
          // and writability are decided independently.
          access: { update: () => false },
          admin: {
            readOnly: true,
            // Raw internal state — useful when debugging why an event was
            // ranked or denied, noise for a region manager grooming a listing.
            condition: adminOnlyCondition,
            description: 'Raw system metadata (community vote tallies, and future internals).',
          },
        },
      ],
    },
    ...legacyMigrationFields(),
  ],
}
