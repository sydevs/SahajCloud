import type { CollectionConfig } from 'payload'

import {
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

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
import { DEFAULT_VERIFICATION_STAGE } from '@/lib/eventVerification/stages'
import { getLanguageOptions } from '@/lib/locales'
import { EVENT_REGISTRATION_QUESTIONS } from '@/lib/registrations/questions'
import { ownedRegionFilterOptions } from '@/plugins/access'
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
import { eventTitleBeforeChange } from './hooks/eventTitle'
import { syncEventFullness } from './hooks/syncFullness'
import { verifyOnSave } from './hooks/verifyOnSave'

const TOGGLE_GROUP_FIELD = '@/components/admin/ToggleGroupField'

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
 */
export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Event', plural: 'Events' },
  versions: { drafts: true },
  // Soft-delete: "archiving" a long-expired event = trashing it (recoverable
  // from the admin trash view) — replaces Atlas's `archived` terminal.
  trash: true,
  admin: {
    group: 'Classes',
    useAsTitle: 'title',
    defaultColumns: ['title', 'verificationStage', '_status'],
    // Live Preview loads the Atlas widget's /preview route. Unlike WeMeditate's
    // server-side preview, the widget fetches the doc back **client-side**,
    // forwarding the secret in the x-sahajcloud-preview-secret header — which
    // unlocks drafts (see @/lib/utilities/previewSecret) and must clear CORS
    // preflight (see `cors` in payload.config.ts). `locale` rides along so the
    // localized title previews in the edited locale.
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
    beforeOperation: [ensureWebPathDeps],
    // verifyOnSave first (re-opens the verification cycle), then the fullness
    // recompute stamps `registrationsFull` onto the outgoing data.
    beforeChange: [verifyOnSave, syncEventFullness],
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
              // Primary event name + useAsTitle. Stored and localized. Required,
              // but a beforeChange hook auto-fills an empty title with
              // "<localized prefix> <venue>" from the first segment of the
              // street address (see ./hooks/eventTitle) before validation runs,
              // so the requirement is satisfied whenever there's an address.
              // The prefix ("Meditation at") is editable per locale in the
              // sy-atlas-translations global.
              name: 'title',
              type: 'text',
              localized: true,
              required: true,
              hooks: { beforeChange: [eventTitleBeforeChange] },
              admin: {
                placeholder: 'Meditation at …',
                description:
                  'Event name. Leave blank to auto-fill from the address (e.g. "Meditation at Beethovenstraße 12").',
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
                  // Inactive events have no schedule, so a public contact is the
                  // only way a seeker can reach out — require it (and the name
                  // below) when inactive. Always visible, so this can't gate on
                  // an `admin.condition`; a validate keeps active events optional.
                  validate: (
                    value: string | null | undefined,
                    { data }: { data?: { inactive?: boolean } },
                  ) =>
                    data?.inactive && !value
                      ? 'Add a contact phone — inactive events have no schedule for seekers to rely on.'
                      : true,
                  admin: {
                    description:
                      'A phone number that seekers can call to learn more about the program.',
                  },
                },
                {
                  name: 'contactName',
                  type: 'text',
                  required: true,
                  // Required (and shown) when a phone is given, or when the event
                  // is inactive. A false condition skips both `required` + this,
                  // so active events without a phone stay unaffected.
                  admin: {
                    condition: (data) => !!data?.contactPhone || !!data?.inactive,
                    description: 'The name of the person they are calling',
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
              admin: { description: 'Photos for this event.' },
            },
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
          label: 'Location',
          fields: [
            {
              name: 'region',
              type: 'relationship',
              label: 'City / Center',
              relationTo: 'regions',
              required: true,
              filterOptions: async (args) => {
                // City/center only, and — for an atlas-manager — within their
                // owned-region subtree.
                const cityOrCenter = { level: { in: ['city', 'center'] } }
                const owned = await ownedRegionFilterOptions(args)
                if (owned === true) return cityOrCenter
                if (owned === false) return false
                return { and: [cityOrCenter, owned] }
              },
              admin: { description: 'The city or center this event belongs to.' },
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
              admin: { condition: (data) => data?.eventType === 'offline' },
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
                    condition: (data) => data?.registrationMode === 'sahaj-atlas',
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
            {
              // Denormalized "at capacity" flag the Atlas widget reads to render
              // its "Full" registration state. A boolean — never a raw count —
              // so a public `sahaj-atlas-client` can select fullness without
              // learning exact registration numbers. Stored (not computed per
              // read) so the geojson feed and list reads stay O(1): maintained
              // by the Registrations create/delete hooks
              // (`syncEventRegistrationsFull`) and recomputed here on a
              // registrationMode / registrationLimit change (`syncEventFullness`
              // beforeChange). True only for `sahaj-atlas` mode with a set limit
              // the registration count has reached; false for `external` mode or
              // a blank (unlimited) limit. System-managed — hidden + read-only.
              name: 'registrationsFull',
              type: 'checkbox',
              defaultValue: false,
              admin: { hidden: true, readOnly: true },
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
              required: true,
              admin: { description: 'Manager responsible for verifying this event.' },
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
              // `should_update_status_at` analog the job filters on
              // (`nextCheckAt <= now`). Set to now + cadence on verification,
              // then to the per-stage offset as the job advances. Hidden — the
              // verification time itself lives in `notificationLog[0]`.
              name: 'nextCheckAt',
              type: 'date',
              // Indexed: the daily ExpireEvents sweep selects on
              // `nextCheckAt <= now`, so this is the one column it filters on.
              index: true,
              admin: { hidden: true },
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
          ],
        },
      ],
    },
    // Canonical Atlas web path/URL: the event's region path + `/<id>`
    // (`/belgium/flanders/antwerp/downtown-hall/12345`). `webPath` + `webUrl`
    // are published-gated — an unpublished event has no public page, and the
    // verify/reminder links + ExpireEvents job rely on that null-on-unpublish
    // contract (`appUrl` is always null — there's no Atlas app deep-link).
    // `region` (an id at depth 0) must be present for the path to resolve; the
    // ensureWebPathDeps beforeOperation hook keeps it selectable on its own.
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
    ...legacyMigrationFields(),
  ],
}
