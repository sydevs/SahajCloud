import type { CollectionConfig, PayloadRequest } from 'payload'

import { hideUntilCreated, legacyMigrationFields } from '@/fields'
import { isAdminManager } from '@/plugins/access/adminOnly'

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
    defaultColumns: ['name', 'email', 'blockedAt'],
    // ⚠ Not `true`, which unregisters the routes too and would leave
    // `blockedAt` below settable by nobody. The function form takes the user,
    // so a non-admin still gets neither the sidebar entry nor the route.
    hidden: ({ user }: { user: unknown }) => !isAdminManager(user as PayloadRequest['user']),
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
      // The lasting half of the abuse brake, beside `repeat_sender`'s automatic
      // 24 hours: screening refuses everything this sender submits while it is
      // set, and the orphan sweep keeps their row so a cleared block cannot be
      // the one that got away.
      //
      // No field access of its own: `users` grants write to no role at all, so
      // only the admin bypass reaches this.
      name: 'blockedAt',
      type: 'date',
      admin: {
        description: 'Set to block this sender. Clear it to lift the block.',
      },
    },
    {
      name: 'blockedReason',
      type: 'textarea',
      admin: {
        description: 'Why this sender was blocked — for whoever reads the record next.',
      },
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
      // Events this registrant sent in through the public submission flow.
      // Kept beside `submissions`, which cannot answer it: `events.submitter`
      // is written when a proposal is accepted, so this is which proposals
      // became listings. Record-keeping only — no access implications.
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
