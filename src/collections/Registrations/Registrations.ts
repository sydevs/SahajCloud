import type { CollectionConfig } from 'payload'

import { legacyMigrationFields, logField } from '@/fields'
import { DEFAULT_LOCALE, getLocaleOptions } from '@/lib/locales'
import { registrationQuestionsJsonSchema } from '@/lib/registrations/questions'

import {
  gateEventFeedback,
  restrictClientRegistrationUpdate,
  syncCommunityFeedback,
} from './hooks/eventFeedback'
import { syncFullnessAfterChange, syncFullnessAfterDelete } from './hooks/syncFullness'

/**
 * Registrations — a registrant (User) signing up for an Event. Migrated from
 * the Atlas `registrations` table.
 */
export const Registrations: CollectionConfig = {
  slug: 'registrations',
  labels: { singular: 'Registration', plural: 'Registrations' },
  admin: {
    group: 'Classes',
    defaultColumns: ['event', 'user', 'startingAt'],
    hidden: true,
  },
  // Keep the owning event's denormalized `registrationsFull` flag in step as
  // registrations come and go (see the event's registrationsFull field), and
  // roll confirm/deny votes up onto the event (`syncCommunityFeedback`). A
  // client update is whitelisted to the `eventFeedback` field and gated on the
  // event still being published + unverified.
  hooks: {
    beforeValidate: [restrictClientRegistrationUpdate],
    beforeChange: [gateEventFeedback],
    afterChange: [syncFullnessAfterChange, syncCommunityFeedback],
    afterDelete: [syncFullnessAfterDelete],
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'event',
          type: 'relationship',
          relationTo: 'events',
          required: true,
        },
        {
          name: 'user',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          admin: { description: 'The registrant.' },
        },
      ],
    },
    {
      name: 'startingAt',
      type: 'date',
      timezone: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'When the registrant is attending.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'client',
          type: 'relationship',
          relationTo: 'clients',
          admin: {
            description:
              'The client service this registration came through. Brands and localizes the emails sent about it.',
          },
        },
        {
          name: 'locale',
          type: 'select',
          options: getLocaleOptions(),
          defaultValue: DEFAULT_LOCALE,
          admin: {
            description:
              "The registrant's language. Emails about this registration are rendered in it.",
          },
        },
      ],
    },
    {
      name: 'questions',
      type: 'json',
      // Typed + validated by a JSON Schema derived from EVENT_REGISTRATION_QUESTIONS:
      // Payload generates the `questions` TS type AND validates on write (an unknown
      // key or non-string answer throws a ValidationError → 400 at the register
      // endpoint, surfaced verbatim rather than a 500).
      jsonSchema: {
        uri: 'urn:sahajcloud:schema:registration-questions',
        fileMatch: ['urn:sahajcloud:schema:registration-questions'],
        schema: registrationQuestionsJsonSchema,
      },
      admin: {
        description:
          "Raw registrant answers, keyed by the event's enabled registration questions (EVENT_REGISTRATION_QUESTIONS — experience, referral, aspirations, questions).",
      },
    },
    {
      // unique already creates a (unique) index — no separate index: true needed.
      name: 'uuid',
      label: 'Identifier',
      type: 'text',
      unique: true,
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'mailingListSubscribedAt',
      type: 'date',
    },
    {
      // Set when the registrant clicks the unsubscribe link in a session
      // reminder. The reminder job skips a registration whose value is set, so
      // no further reminders go out — but the registration itself is left
      // intact. Distinct from `mailingListSubscribedAt`, which records
      // mailing-list consent (a separate concern this deliberately doesn't
      // touch).
      name: 'remindersUnsubscribedAt',
      type: 'date',
      admin: { readOnly: true },
    },
    logField({
      // Everything recorded about this registration — the reminders and the
      // post-event follow-up today, and whatever else earns a line later
      // (created, cancelled). It was `reminderLog`: reminders only, and
      // `admin.readOnly` json with no renderer, so the one question it could
      // answer ("did that go out?") needed a database query to ask.
      //
      // Doubles as the exactly-once guard: each job checks `hasLogEntry`
      // before sending and appends immediately after, so a task retry or an
      // overlapping run never double-sends.
      description: 'Everything recorded about this registration, newest first.',
      columns: [
        { key: 'activity', label: 'Event' },
        { key: 'sentTo', label: 'Sent to' },
      ],
    }),
    {
      type: 'row',
      fields: [
        {
          // The registrant's community verdict on an UNVERIFIED event — "did
          // this class actually take place?". One vote per registration
          // (that's the dedup), re-votable while the event stays unverified;
          // the write is authenticated by possession of the registration
          // `uuid` (see registrationFeedbackAccess). The vote-sync hook rolls
          // tallies up onto the event.
          name: 'eventFeedback',
          type: 'select',
          options: [
            { label: 'Confirmed', value: 'confirmed' },
            { label: 'Denied', value: 'denied' },
          ],
          enumName: 'enum_registrations_event_feedback',
          admin: { description: 'Registrant’s verdict on an unverified event.' },
        },
        {
          // The follow-up sweep's query filter — `activityLog` records *that* it
          // was sent, but nothing can `where` on a JSON column cheaply, so the
          // scan still needs a real dated column to select on. Record and
          // filter are different jobs; see `logField`.
          name: 'followUpSentAt',
          type: 'date',
          admin: { hidden: true },
        },
      ],
    },
    ...legacyMigrationFields(),
  ],
}
