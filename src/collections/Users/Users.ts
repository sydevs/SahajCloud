import type { CollectionConfig } from 'payload'

import { hideUntilCreated, legacyMigrationFields } from '@/fields'
import { normalizeEmail } from '@/lib/users/upsertUserByEmail'

import { blockUser } from './endpoints/block'
import { refuseDeletingSender } from './hooks/refuseDeletingSender'

const BLOCK_BUTTON = '@/components/admin/BlockUserButton'

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
    // The address, not the name: the name is often guessed from the address's
    // local part (`displayNameFor`), and a submission's "Submitted By" chip is
    // where a reader looks for who wrote in.
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'blockedAt'],
    // ⚠ No `hidden` key, deliberately: `accessPlugin` derives it (docs/rules/admin-ui.md)
    components: {
      edit: {
        beforeDocumentControls: [{ path: BLOCK_BUTTON, clientProps: { source: 'users' } }],
      },
    },
  },
  endpoints: [blockUser],
  hooks: {
    beforeDelete: [refuseDeletingSender],
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
      // Every writer, not only the public upsert: an admin correcting an address
      // must not mint a second spelling that `upsertUserByEmail` never matches.
      hooks: {
        beforeValidate: [
          ({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value),
        ],
      },
    },
    {
      // Written by the Block / Unblock button alone (`endpoints/block.ts`), which
      // also refuses the sender's open submissions — a hand-set date would block
      // without doing that.
      name: 'blockedAt',
      type: 'date',
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description: 'Set by the Block button. Nothing this sender submits is delivered while set.',
      },
    },
    {
      name: 'blockedReason',
      type: 'textarea',
      admin: {
        description:
          'Why this sender was blocked — for whoever reads the record next. Kept when the block is lifted.',
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
