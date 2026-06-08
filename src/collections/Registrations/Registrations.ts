import type { CollectionConfig } from 'payload'

import { legacyMigrationFields } from '@/fields'

/**
 * Registrations — a registrant (User) signing up for an Event. Migrated from
 * the Atlas `registrations` table.
 */
export const Registrations: CollectionConfig = {
  slug: 'registrations',
  labels: { singular: 'Registration', plural: 'Registrations' },
  admin: {
    group: 'Sahaj Atlas',
    defaultColumns: ['event', 'user', 'startingAt'],
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
      name: 'questions',
      type: 'json',
      admin: {
        description:
          'Raw registration answers (keys: questions / experience / aspirations / referral).',
      },
    },
    {
      // unique already creates a (unique) index — no separate index: true needed.
      name: 'uuid',
      type: 'text',
      unique: true,
      label: 'UUID',
    },
    {
      name: 'mailingListSubscribedAt',
      type: 'date',
    },
    ...legacyMigrationFields(),
  ],
}
