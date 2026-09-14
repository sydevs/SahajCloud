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
      // place. It will replace the two joins below, which between them can
      // only answer two of those four questions and make a sender's history
      // look like two unrelated histories (#723).
      //
      // ⚠ It shows nothing yet, and the two below are not redundant until it
      // does. Phase 1 adds the schema only: `registerForEvent` still creates
      // `registrations`, and `event-submissions` still takes proposals, so
      // nothing writes `user-submissions`. They are removed in Phase 3, with
      // the collections they read — #723 is explicit that the old
      // collections' behaviour does not change this phase.
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
