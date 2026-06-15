import type { CollectionConfig } from 'payload'

import {
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import {
  addressFields,
  legacyMigrationFields,
  scheduleFields,
  urlField,
  publicUrlFields,
} from '@/fields'
import { DEFAULT_VERIFICATION_STAGE } from '@/lib/eventVerification/stages'
import { getLanguageOptions } from '@/lib/locales'

import { verifyEventAction } from './endpoints/verifyEventAction'
import {
  EVENT_REGISTRATION_MODE_OPTIONS,
  EVENT_REGISTRATION_QUESTIONS,
  EVENT_TYPE_OPTIONS,
  VERIFICATION_STAGE_OPTIONS,
} from './eventOptions'
import { eventTitleBeforeChange } from './hooks/eventTitle'
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
  },
  // Re-verify on any manager save; the explicit POST endpoint backs the notice
  // banner's Verify button. The tokenized email link is the `/events/verify`
  // frontend page (it calls the shared verify op via a Server Action).
  hooks: {
    beforeChange: [verifyOnSave],
  },
  endpoints: [verifyEventAction],
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
              name: 'language',
              type: 'select',
              required: true,
              options: getLanguageOptions(),
              admin: { description: 'Language this event is conducted in.' },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'contactPhone',
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
                },
                {
                  name: 'contactName',
                  type: 'text',
                  required: true,
                  // Required (and shown) when a phone is given, or when the event
                  // is inactive. A false condition skips both `required` + this,
                  // so active events without a phone stay unaffected.
                  admin: { condition: (data) => !!data?.contactPhone || !!data?.inactive },
                },
              ],
            },
            {
              name: 'description',
              type: 'richText',
              editor: eventDescriptionEditor,
            },
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
              relationTo: 'regions',
              filterOptions: () => ({ level: { in: ['city', 'center'] } }),
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
              ],
            },
            {
              name: 'registrationLimit',
              type: 'number',
              min: 0,
              admin: {
                description: 'Maximum registrations (blank = unlimited).',
              },
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
            },
          ],
        },
        {
          label: 'Verification',
          fields: [
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
                description:
                  'Public events are re-verified periodically so the map stays accurate. If an event isn’t re-verified in time, its manager — then the region managers above it — are reminded, and it’s eventually unpublished. Saving or publishing the event re-verifies it and restarts this cycle.',
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
    // Virtual public link to the event on the Sahaj Atlas map — only while the
    // event is published (an unpublished/expired event has no public page).
    ...publicUrlFields({
      web: () =>
        process.env.WEMEDITATE_WEB_URL ? `${process.env.WEMEDITATE_WEB_URL}/map#/!/` : null,
      buildPath: ({ data }) => (data?.id ? `events/${data.id}` : null),
      exposeWhen: ({ data }) => data?._status === 'published',
    }),
    ...legacyMigrationFields(),
  ],
}
