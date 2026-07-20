import type { CollectionConfig } from 'payload'

import { legacyMigrationFields } from '@/fields'
import { DEFAULT_LOCALE, getLocaleOptions } from '@/lib/locales'
import { registrationQuestionsJsonSchema } from '@/lib/registrations/questions'

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
      // Typed + validated by a JSON Schema derived from EVENT_REGISTRATION_QUESTIONS:
      // Payload generates the `questions` TS type AND validates on write (an unknown
      // key or non-string answer throws a ValidationError → 400 at the register
      // endpoint, surfaced verbatim rather than a 500).
      jsonSchema: {
        uri: 'https://sahajcloud.dev/schemas/registration-questions.json',
        fileMatch: ['https://sahajcloud.dev/schemas/registration-questions.json'],
        schema: registrationQuestionsJsonSchema,
      },
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
