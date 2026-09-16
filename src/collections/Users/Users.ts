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
      // Everything this person has ever sent us, of any kind — a contact
      // message, a subscription, a registration, an event proposal — in one
      // place, where the `registrations` join this replaced could answer one
      // of those four questions and made a sender's history look like two
      // unrelated histories (#723).
      //
      // A join can only target a relationship column, which is why
      // `user-submissions.user` is a real column on every type rather than a
      // key inside `submissionData`.
      name: 'submissions',
      type: 'join',
      collection: 'user-submissions',
      on: 'user',
      admin: {
        condition: hideUntilCreated,
      },
    },
    {
      // Kept beside `submissions`, not folded into it: it answers which
      // proposals became real listings, which a join over submissions cannot
      // — `events.submitter` is written when a proposal is accepted.
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
