import type { CollectionConfig } from 'payload'

import {
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { legacyMigrationFields, scheduleField, urlField } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'

import {
  EVENT_REGISTRATION_MODE_OPTIONS,
  EVENT_REGISTRATION_QUESTION_OPTIONS,
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
 * `scheduleField` (which also stores the timezone on its First Date & Time);
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
              admin: {
                condition: (data) => data?.eventType === 'online',
                description: 'Link attendees join the online event through.',
              },
            }),
            {
              name: 'language',
              type: 'select',
              options: getLanguageOptions(),
              admin: { description: 'Language this event is conducted in.' },
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
            {
              name: 'contactInfo',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'name', type: 'text', admin: { width: '50%' } },
                    { name: 'phone', type: 'text', admin: { width: '50%' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Schedule',
          fields: [
            scheduleField({
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
              name: 'room',
              type: 'text',
              admin: {
                width: '50%',
                description: 'Room or floor within the venue, if any.',
              },
            },
            {
              name: 'address',
              type: 'group',
              // Physical address only applies to offline events; online ones
              // keep `region` (above) but hide the street/coords.
              admin: { condition: (data) => data?.eventType === 'offline' },
              fields: [
                {
                  name: 'street',
                  type: 'text',
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'city', type: 'text', admin: { width: '25%' } },
                    { name: 'postCode', type: 'text', admin: { width: '25%' } },
                    {
                      name: 'countryCode',
                      type: 'text',
                      admin: { width: '25%', description: 'ISO 3166-1 alpha-2.' },
                    },
                    { name: 'regionCode', type: 'text', admin: { width: '25%' } },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'latitude', type: 'number', admin: { width: '50%' } },
                    { name: 'longitude', type: 'number', admin: { width: '50%' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Registration',
          fields: [
            {
              name: 'registrationMode',
              type: 'select',
              required: true,
              defaultValue: 'native',
              options: [...EVENT_REGISTRATION_MODE_OPTIONS],
              admin: { components: { Field: TOGGLE_GROUP_FIELD } },
            },
            urlField({
              name: 'registrationUrl',
              label: 'Registration URL',
              admin: {
                condition: (data) => data?.registrationMode !== 'native',
                description: 'External registration link (non-native modes).',
              },
            }),
            {
              name: 'registrationLimit',
              type: 'number',
              min: 0,
              admin: {
                width: '50%',
                description: 'Maximum registrations (blank = unlimited).',
              },
            },
            {
              name: 'registrationQuestions',
              type: 'select',
              hasMany: true,
              options: [...EVENT_REGISTRATION_QUESTION_OPTIONS],
              admin: {
                description: 'Which optional questions to ask registrants.',
                components: { Field: TOGGLE_GROUP_FIELD },
              },
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
