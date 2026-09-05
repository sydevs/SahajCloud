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
  logField,
  publicUrlFields,
  scheduleFields,
  systemMetaField,
  urlField,
} from '@/fields'
import { getCanonicalUrlBase } from '@/lib/atlas/regionOwners'
import { getRegionWebPaths } from '@/lib/atlas/regionTree'
import { revalidateAtlasSidebarHook } from '@/lib/atlasSidebar/cache'
import { serverEnv } from '@/lib/env/server'
import { EVENT_QUALITY_CHECK_METADATA, SKIP_REASON_LABELS } from '@/lib/eventQuality'
import { communityFeedbackJsonSchema } from '@/lib/eventVerification/communityFeedback'
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

/** Bound for the free-text contact fields. Matches the address fields' limit. */
const CONTACT_TEXT_MAX = 100
/** Bound for a contact email address (the RFC 5321 maximum). */
const CONTACT_EMAIL_MAX = 254

/**
 * Minimal rich-text editor for the event description.
 * It supports italic, one heading level (H3), links, and the inline toolbar. Nothing heavier.
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
 * Events: Sahaj Atlas events (offline meetups and online sessions), migrated
 * from the Atlas `events` table. Drafts replace Atlas's `published` boolean.
 * Payload owns the publish control. The schedule lives in the project's
 * `scheduleFields`, which also stores the timezone on its First Date & Time.
 * The Atlas `finishDate` maps into the schedule's ending, not a standalone field.
 *
 * **Finished-event read contract, for `sahaj-atlas-client`.** When an event's
 * schedule runs out, the ExpireEvents job marks it `finished`, but leaves it
 * **published** (#603, see `finishEvent`). Its Atlas page must keep resolving
 * for a late seeker who follows an old link, and `webPath`/`webUrl` are
 * publish-gated. So `GET /api/events/:id` stays readable, and the widget
 * renders an "Ended" panel. The public *feeds* drop the event instead
 * (`GET /api/events` for clients, and `GET /api/events/geojson`), through
 * `excludeFinishedEvents` and `notFinishedWhere`. The pinned contract: a
 * finished event stays readable by id, but is absent from the feeds.
 *
 * The register endpoint's gate (`event_ended`) refuses registration for a
 * finished, or otherwise elapsed, event. So the read staying open cannot leak
 * a registration into an event that has really ended.
 */
export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Event', plural: 'Events' },
  versions: { drafts: true },
  // Soft delete: "archiving" a long-expired event means trashing it, and it
  // stays recoverable from the admin trash view. This replaces Atlas's
  // `archived` terminal state.
  trash: true,
  // Computing the listing-quality report costs two extra reads. Nothing that
  // hydrates an Event through a relationship (a Registration, the sidebar)
  // wants that report. Its `afterRead` also opts out of list reads. See the field.
  defaultPopulate: { qualityReport: false },
  admin: {
    group: 'Classes',
    useAsTitle: 'title',
    defaultColumns: ['title', 'verificationStage', '_status'],
    // Live Preview loads the Atlas widget's /preview route. Unlike WeMeditate's
    // server-side preview, the widget fetches the document back
    // **client-side**. It forwards the secret in the x-sahajcloud-preview-secret
    // header, which unlocks drafts (see @/lib/utilities/previewSecret) and
    // must clear the CORS preflight (see `cors` in payload.config.ts). `locale`
    // rides along too, so the widget renders its own chrome in the edited
    // locale. The event's title is one non-localized value, and the widget
    // translates it client-side.
    livePreview: {
      // An unsaved document has nothing to fetch yet. Returning null disables the panel.
      url: ({ data, locale }) =>
        data.id
          ? `${serverEnv.SAHAJATLAS_URL}/preview?collection=events&id=${data.id}&secret=${serverEnv.SAHAJCLOUD_PREVIEW_SECRET}&locale=${locale.code}`
          : null,
      // Phone-sized frame for the widget's bottom-sheet drawer layout.
      breakpoints: [{ label: 'Mobile', name: 'mobile', width: 390, height: 844 }],
    },
  },
  // Re-verify on any manager save. The explicit POST endpoint backs the
  // notice banner's Verify button. The tokenized email link opens the
  // `/events/verify` frontend page, which calls the shared verify operation
  // through a Server Action.
  hooks: {
    // Keep `webPath`/`webUrl` resolvable when a read selects them without
    // their inputs (`region`, and `_status` for `webUrl`). See ensureWebPathDeps.
    // Then drop finished events from API-client list reads. They stay
    // published so their pages resolve, but should not be listed. See
    // excludeFinishedEvents.
    beforeOperation: [ensureWebPathDeps, excludeFinishedEvents],
    // syncVerificationOnSave must run first. It decides the stage this save
    // lands on: verify, or just re-arm the pre-adoption watermark. Both
    // stamping hooks must run after it. `syncEventFullness` writes
    // `registrationsFull`, and `stampEventQuality`'s skip rules read
    // `verificationStage`.
    beforeChange: [syncVerificationOnSave, syncEventFullness, stampEventQuality],
    // Clear the Atlas manager sidebar cache (event list and region counts)
    // whenever an event changes, or is trashed or restored.
    afterChange: [revalidateAtlasSidebarHook],
    afterDelete: [revalidateAtlasSidebarHook],
  },
  endpoints: [verifyEventAction, eventsGeoJson, registerForEvent],
  fields: [
    {
      // A contextual banner above the tabs. It warns when the event is due
      // for verification, or past due, and offers a Verify button (the
      // explicit endpoint). It renders nothing for a freshly verified or
      // unsaved event.
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
              // The primary event name, and `useAsTitle`. **Not localized.**
              // The Atlas widget translates the title client-side, so one
              // stored value in the default locale is the whole story here. A
              // beforeChange hook fills an empty title from the venue name
              // (see ./hooks/eventTitle).
              name: 'title',
              type: 'text',
              required: true,
              // Matches the address fields' limit. The longest title in the
              // Atlas data is 94 characters, and nothing exceeds 100. So this
              // bounds new writing, without locking anyone out of a listing
              // they already have. `maxLength` is Payload validation, not a
              // column width, so it needs no migration.
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
                  // An inactive event has no schedule, so a *reachable
                  // person* is the only way a seeker can find out more. An
                  // inactive event must carry one. A phone or an email
                  // satisfies this. A website deliberately does not: a page
                  // is metadata about the event, not a route to someone who
                  // can answer a question. The same applies to `onlineUrl`, a
                  // join link for sessions an inactive event is not running.
                  // This field is always visible, so it cannot gate on an
                  // `admin.condition`. A validate function keeps active
                  // events optional instead.
                  //
                  // Composed with `text` from payload/shared, because
                  // supplying `validate` REPLACES Payload's default, which
                  // would otherwise silently drop `maxLength`. See
                  // src/collections/AGENTS.md.
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
                  // An `email` field validates format, but takes no
                  // `maxLength` of its own. Without this, it stays unbounded
                  // on a public-facing listing. Composed with `email` from
                  // payload/shared, for the same reason as the phone field
                  // above: a custom `validate` replaces the built-in check,
                  // so it must re-run that check before adding the bound.
                  //
                  // This deliberately does NOT repeat the inactive-contact
                  // rule. Either field satisfies that rule, and asserting it
                  // here too would surface the same complaint on two fields
                  // at once.
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
                  // Shown once there is a contact route to put a name to:
                  // whoever answers the phone, or reads the inbox. Not
                  // *required*. The Atlas dump holds numbers and addresses
                  // with no name against them, and refusing those would throw
                  // away the only contact route a dormant listing had. A
                  // nicety, not a necessity.
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
            // Canonical Atlas web path and URL: the event's region path, plus
            // `/<id>` (for example `/belgium/flanders/antwerp/downtown-hall/12345`).
            // Publish-gated: an unpublished event has no public page, and the
            // verify and reminder links, plus the ExpireEvents job, rely on
            // that null-on-unpublish contract. (`appUrl` is always null. There
            // is no Atlas app deep-link.)
            // `region` (an id at depth 0) must be present for the path to
            // resolve. The ensureWebPathDeps beforeOperation hook keeps
            // `region` selectable on its own. `region` is also exactly the
            // input that canonical ownership resolves on, so that hook needs
            // no change to keep `webUrl` resolvable.
            //
            // The base is per-region (#634): the client that owns this
            // event's region, or the nearest owning ancestor, on its own
            // domain, falling back to the We Meditate surface. Not
            // `SAHAJATLAS_URL`, which is `noindex` by policy.
            ...publicUrlFields({
              web: ({ data, req }) => getCanonicalUrlBase(req, relationId(data?.region)),
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
                // City or venue only. For an atlas-manager, also within their
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
              // The building's name is what a seeker recognizes. The title
              // auto-fill prefers this over the street — see eventTitle.ts.
              hasVenueName: true,
              admin: { condition: (data) => data?.eventType === 'offline' },
            }),
          ],
        },
        {
          label: 'Schedule',
          fields: [
            {
              // Dormant events have no active schedule. They still need
              // verification, and can expire, but never auto-finish: the
              // ExpireEvents finished-check skips inactive events. Hiding the
              // schedule when inactive also drops its `required` validation.
              // Payload skips `required` and `validate` when a condition is
              // false.
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
                  // Built-in email format validation. No hand-rolled validator.
                  type: 'email',
                  admin: {
                    // Hidden pre-adoption. An unverified or denied event has
                    // no manager, and its registrations are recorded, but
                    // forwarded to nobody until a manager adopts the event.
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
                  // These options come from NOTIFICATION_TYPES'
                  // `event_registration` entry, so the two surfaces cannot
                  // drift. Summary cadences are omitted until the digest run
                  // exists (see #588 §4). Immediate is the default, matching
                  // buildDefaultNotificationPreferences.
                  defaultValue: DEFAULT_REGISTRATION_FREQUENCY,
                  options: [...REGISTRATION_OVERRIDE_FREQUENCY_OPTIONS],
                  // Pin the enum name so it stays stable across migrations.
                  // This mirrors `verificationStage`, and never collides with
                  // the drafts `_status` enum.
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
              // A tutorial banner that explains the verification lifecycle,
              // shown above the manager and stage tracker. A generic
              // InfoBanner (icon, title, and text via `custom`). See
              // @/components/admin/InfoBanner.
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
              // Conditionally required, not `required: true`. The
              // pre-adoption stages (`unverified` and `denied`) have no
              // manager by definition, and the field must stay *visible*
              // there. Assigning a manager and saving is exactly how those
              // events get adopted — the save hook then flips the stage to
              // `verified`. Every other stage still demands a manager:
              // verified implies managed. `finished` is also exempt. The
              // stale sweep finishes run-out unverified events that never
              // got adopted, and a terminal stage sends no reminders for a
              // manager to receive.
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
              // System-managed: the ExpireEvents job advances this, and the
              // verify operation resets it to `verified`. `enumName` is
              // pinned so it never collides with the drafts `_status` enum
              // (`enum_events_status`).
              enumName: 'enum_events_verification_stage',
              admin: {
                readOnly: true,
                components: { Field: '@/components/admin/VerificationStageField' },
              },
            },
            logField({
              // Today this logs the verification cycle: the verification
              // that opened it, plus one reminder entry per send. It is
              // named generically, because an event's history will grow past
              // verification. It resets on every verification, which is why
              // it stays its own field, rather than accumulating like a
              // registration's log.
              //
              // This log also acts as the job's exactly-once marker: it
              // skips recipients already logged for this stage, by reading
              // entries back as data. The builders emit these cells
              // *alongside* `stage`, `level`, and `manager`, and the row's
              // ⋯ menu shows the rest.
              description:
                'Current verification cycle — the verification that opened it plus each reminder sent. Reset on every verification.',
              columns: [
                { key: 'activity', label: 'Event' },
                { key: 'who', label: 'Who' },
                { key: 'delivery', label: 'Delivery' },
              ],
            }),
            {
              // The Wilson lower bound of registrant confirm/deny votes, in
              // [0, 1]. Null until the first vote. A real, indexed column,
              // unlike the raw tallies in `systemMeta`, because the Atlas
              // feeds sort and filter on it to rank unverified listings by
              // confidence. Only the Registrations vote-sync hook writes it.
              //
              // Shown for both pre-adoption stages. `unverified` is where
              // votes get collected, and on a `denied` event the score is
              // the reason it was taken down — exactly when a manager wants
              // to see it. Hidden once adopted, where a manager vouches for
              // the event instead, and the number becomes a stale artifact.
              name: 'confidenceScore',
              label: 'Community Confidence',
              type: 'number',
              index: true,
              admin: {
                readOnly: true,
                condition: (data) => isPreAdoptionStage(data?.verificationStage),
                description:
                  'How strongly attendees confirm this event is real (0–1). Rises with confirmations, falls with denials, and stays cautious while there are few votes — the Atlas map ranks unverified listings by it. Blank until the first vote.',
              },
            },
          ],
        },
      ],
    },
    {
      // Advisory listing-quality recommendations (#609), shown in the
      // sidebar above Legacy Data. Computed on read, so opening the event is
      // already fresh. There is deliberately no refresh control: one would
      // have to re-save the document, and would churn `updatedAt` and the
      // version history.
      //
      // NOT localized: `description`, `images`, and `website` are not
      // localized either, and the per-locale tier's whole job is answering
      // "which of my languages is missing a title." A localized field
      // returns only the active locale, so it structurally cannot answer that.
      // Virtual: produced by the hook below and never written, so a schema has
      // nothing to validate. The shape is already typed at its source
      // (`EventQualityReport` in `@/lib/eventQuality`) — declaring it again
      // would be a second definition to keep in step, which is the drift #659
      // set out to remove.
      name: 'qualityReport',
      type: 'json',
      virtual: true,
      label: false,
      admin: {
        position: 'sidebar',
        readOnly: true,
        components: { Field: '@/components/admin/EventQualityPanel' },
        // Labels live with the check definitions, so the code stays the
        // single source of truth. A new check cannot ship unlabeled.
        custom: {
          checksMetadata: EVENT_QUALITY_CHECK_METADATA,
          skipReasonLabels: SKIP_REASON_LABELS,
        },
      },
      hooks: { afterRead: [computeEventQualityReport] },
    },
    {
      // Every machine-maintained value on the document, in one collapsed
      // drawer. None of these fields are editable. Hooks and the nightly job
      // write them. But hiding them outright, as before, meant the only way
      // to see why an event behaved as it did was to query the database.
      label: 'System',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          // Who sent this listing in: the registrant record that the public
          // submission flow upserts, or the system user for bulk imports.
          // For record-keeping and abuse tracking only. It grants no access.
          name: 'submitter',
          type: 'relationship',
          relationTo: 'users',
          admin: {
            readOnly: true,
            description: 'Who submitted this listing (record-keeping only).',
          },
        },
        {
          // The `should_update_status_at` analog that the job filters on
          // (`nextCheckAt <= now`). This watermark makes every lifecycle
          // transition reachable. See @/lib/eventVerification/watermark.
          name: 'nextCheckAt',
          type: 'date',
          // Indexed. The daily ExpireEvents sweep selects on
          // `nextCheckAt <= now`, so this is the one column it filters on.
          index: true,
          admin: {
            readOnly: true,
            description: 'When the nightly job will next act on this event.',
          },
        },
        {
          // A denormalized "at capacity" flag. The Atlas widget reads it to
          // render its "Full" registration state. A boolean, never a raw
          // count, so a public `sahaj-atlas-client` can select fullness
          // without learning exact registration numbers. Stored, not
          // computed per read, so the geojson feed and list reads stay O(1).
          // The Registrations create and delete hooks maintain it
          // (`syncEventRegistrationsFull`), and it recomputes here on a
          // registrationMode or registrationLimit change (`syncEventFullness`
          // beforeChange). True only for `sahaj-atlas` mode with a set limit
          // the registration count has reached. False for `external` mode,
          // or a blank (unlimited) limit.
          name: 'registrationsFull',
          type: 'checkbox',
          defaultValue: false,
          admin: { readOnly: true, description: 'Registrations have reached the limit.' },
        },
        {
          // Open document-scope items, for list-view sorting and targeted
          // queries. A query pre-filter, not a score: the per-locale checks
          // read localized titles that a write hook cannot see, so a single
          // non-localized column cannot hold a correct cross-locale figure.
          name: 'qualityOpenCount',
          type: 'number',
          index: true,
          admin: { readOnly: true, description: 'Open listing-quality recommendations.' },
        },
        {
          // Which version of the check set produced `qualityOpenCount`, so a
          // stored count stays comparable across deploys. Stamped on every
          // write. Nothing re-stamps this in bulk: production is seeded by
          // the Atlas import, which writes through the same hook.
          name: 'qualityCheckVersion',
          type: 'number',
          admin: { readOnly: true, description: 'Check-set version the count was stamped from.' },
        },
        systemMetaField({
          uri: 'https://sahajcloud.dev/schemas/event-system-meta.json',
          namespaces: { communityFeedback: communityFeedbackJsonSchema },
          admin: {
            // Raw internal state. Useful when debugging why an event was
            // ranked or denied. Noise for a region manager grooming a listing.
            condition: adminOnlyCondition,
            description: 'Raw system metadata (community vote tallies, and future internals).',
          },
        }),
      ],
    },
    ...legacyMigrationFields(),
  ],
}
