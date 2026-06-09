import type { CollectionConfig } from 'payload'

import {
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { addressFields, legacyMigrationFields, scheduleFields, urlField } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'

import {
  EVENT_REGISTRATION_MODE_OPTIONS,
  EVENT_REGISTRATION_QUESTIONS,
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
} from './eventOptions'
import { eventTitleBeforeChange } from './hooks/eventTitle'

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
  admin: {
    group: 'Sahaj Atlas',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', '_status'],
  },
  fields: [
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
                { name: 'contactPhone', type: 'text' },
                {
                  name: 'contactName',
                  type: 'text',
                  required: true,
                  admin: { condition: (data) => !!data?.contactPhone },
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
            scheduleFields({
              label: false,
              required: true,
              hasComplexWeekly: true,
              hasComplexMonthly: true,
              hasEndTime: true,
              hasEnding: true,
              hasExclusions: true,
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
              filterOptions: () => ({ level: { in: ['area', 'center'] } }),
              admin: { description: 'The area or center this event belongs to.' },
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
              name: 'registrationMode',
              type: 'select',
              required: true,
              defaultValue: 'sahaj-atlas',
              options: [...EVENT_REGISTRATION_MODE_OPTIONS],
              admin: { components: { Field: TOGGLE_GROUP_FIELD } },
            },
            urlField({
              name: 'registrationUrl',
              label: 'Registration URL',
              admin: {
                condition: (data) => data?.registrationMode === 'external',
                description: 'External registration link.',
              },
            }),
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
              name: 'status',
              type: 'select',
              required: true,
              defaultValue: 'active',
              options: [...EVENT_STATUS_OPTIONS],
              // Drafts already own the `_status` field, whose Postgres enum is
              // `enum_events_status` — the default name this field would also
              // generate. Override it so the two enums don't collide.
              enumName: 'enum_events_activity_status',
              admin: { components: { Field: TOGGLE_GROUP_FIELD } },
            },
            {
              name: 'verificationStreak',
              type: 'number',
              min: 0,
              defaultValue: 0,
              admin: { readOnly: true, description: 'Consecutive successful verifications.' },
            },
          ],
        },
      ],
    },
    ...legacyMigrationFields(),
  ],
}
