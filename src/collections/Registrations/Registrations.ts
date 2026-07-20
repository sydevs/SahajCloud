import type { CollectionConfig } from 'payload'

import { legacyMigrationFields } from '@/fields'
import { DEFAULT_LOCALE, getLocaleOptions } from '@/lib/locales'

// Registration answers are answers to the event's questions, so the shape is
// defined and validated by the Events question set (the single source of truth).
import { validateRegistrationQuestions } from '../Events/eventOptions'

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
    ...legacyMigrationFields(),
  ],
}
