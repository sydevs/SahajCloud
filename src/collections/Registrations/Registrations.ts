import type { CollectionConfig } from 'payload'

import { legacyMigrationFields } from '@/fields'
import { DEFAULT_LOCALE, getLocaleOptions } from '@/lib/locales'
import { validateRegistrationQuestions } from '@/lib/registrations/questions'

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
      // Enforce the shape: keys ⊆ EVENT_REGISTRATION_QUESTIONS, string answers.
      // A bad payload throws a ValidationError (400) — the register endpoint's
      // catch surfaces it verbatim rather than a 500.
      validate: (value: unknown) => validateRegistrationQuestions(value),
      admin: {
        description:
          "Raw registrant answers, keyed by the event's enabled registration questions (EVENT_REGISTRATION_QUESTIONS — priorExperience, referralSource, healthInfo, accessibility, guests).",
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
    {
      // Exactly-once ledger for session reminders: one entry per occurrence
      // this registration has already been reminded for. The reminder job
      // checks membership before sending and appends immediately after, so a
      // task retry or an overlapping run never double-sends. Mirrors the Events
      // `notificationLog` pattern.
      name: 'reminderLog',
      type: 'json',
      admin: { readOnly: true },
    },
    ...legacyMigrationFields(),
  ],
}
