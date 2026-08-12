import type { CollectionConfig } from 'payload'

import { hideUntilCreated, legacyMigrationFields } from '@/fields'

/**
 * Users — Sahaj Atlas event registrants (the people who sign up for events),
 * distinct from Managers (the admin/login accounts). Non-auth: these records
 * are never logged into. Not added to any project, so only admins see them in
 * the sidebar — they're not exposed in the Sahaj Atlas project view.
 *
 * Labelled "Registrant" in the admin to avoid confusion with Managers, which
 * are the actual login users; the slug stays `users` for the importer.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Registrant', plural: 'Registrants' },
  admin: {
    group: 'Access',
    useAsTitle: 'name',
    defaultColumns: ['name', 'email'],
    hidden: true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      // unique already creates a (unique) index — no separate index: true needed.
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
    },
    {
      name: 'registrations',
      type: 'join',
      collection: 'registrations',
      on: 'user',
      admin: {
        condition: hideUntilCreated,
      },
    },
    {
      // Events this registrant sent in through the public submission flow
      // (`events.submitter` is record-keeping only — no access implications).
      name: 'submittedEvents',
      type: 'join',
      collection: 'events',
      on: 'submitter',
      admin: {
        condition: hideUntilCreated,
      },
    },
    ...legacyMigrationFields(),
  ],
}
