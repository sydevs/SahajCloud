/**
 * `registration-refusals`: one row per class sign-up the spam check refused,
 * read by `SendRefusedRegistrationDigests` (sydevs/SahajAtlasWeb#259).
 *
 * Two stages refuse a sign-up, and they leave different things behind:
 *
 * - **`request`** — the write guard or `prepareUserSubmission` refused the
 *   create, so no `user-submissions` row exists. The visitor was shown the
 *   reason, and the request's contents are not kept: a body that failed the
 *   captcha is untrusted, and copying its name or address into an admin's inbox
 *   would hand anyone a captcha-free way to email admins text of their choosing.
 *   What is kept is the class and the reason, which is what tells an admin that
 *   real people are being turned away from it.
 * - **`screening`** — the row was accepted, then `screenSubmission` filed it
 *   `spam`. The visitor saw a success message, so this is the refusal nobody
 *   else hears of. `submission` points at that row, which already holds who
 *   they are — registrations are durable, so nothing is copied here.
 *
 * ⚠ **Access is explicit and admin-only**, like `imports`: a role-wide grant
 * would let any manager read every class's refusals. Nothing creates or edits a
 * row through the API; both writers pass `overrideAccess`.
 */

import type { Access, CollectionConfig } from 'payload'

import { isAdminManager } from '@/plugins/access'
import type { PurgeWindow, RetentionConfig } from '@/types/retention'

/**
 * How long a refusal is kept. The same span as a machine-refused submission
 * (`MACHINE_SPAM_DAYS`): both are the record of what the spam check turned
 * away, kept while a pattern in it is still worth seeing. Far longer than the
 * weekly digest that reads it, so a digest that failed for days still finds its
 * rows when it retries.
 */
export const REFUSAL_RETENTION_DAYS = 90

const REFUSAL_WINDOWS: PurgeWindow[] = [
  {
    days: REFUSAL_RETENTION_DAYS,
    name: 'refusals',
    where: (cutoff) => ({ createdAt: { less_than: cutoff } }),
  },
]

const REFUSAL_RETENTION: RetentionConfig = { windows: REFUSAL_WINDOWS }

const adminsOnly: Access = ({ req }) => isAdminManager(req.user)

export const RegistrationRefusals: CollectionConfig = {
  slug: 'registration-refusals',
  labels: { singular: 'Refused Sign-up', plural: 'Refused Sign-ups' },
  admin: {
    group: 'System',
    defaultColumns: ['event', 'stage', 'reason', 'createdAt'],
    description:
      'Class sign-ups the spam check refused. Admins receive these as a digest, configured under Notifications.',
  },
  access: {
    create: () => false,
    read: adminsOnly,
    update: () => false,
    delete: adminsOnly,
  },
  custom: { retention: REFUSAL_RETENTION },
  fields: [
    {
      name: 'event',
      type: 'relationship',
      relationTo: 'events',
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'stage',
      type: 'select',
      required: true,
      options: [
        { label: 'At the form', value: 'request' },
        { label: 'At screening', value: 'screening' },
      ],
      admin: { readOnly: true },
    },
    {
      // Text, not a select: the codes are the write guard's and the screening
      // job's own vocabularies, and an enum here would turn a code added there
      // into a failed insert — a refusal lost without a trace.
      name: 'reason',
      type: 'text',
      required: true,
      admin: { readOnly: true },
    },
    {
      name: 'submission',
      type: 'relationship',
      relationTo: 'user-submissions',
      admin: {
        readOnly: true,
        condition: (data) => data?.stage === 'screening',
      },
    },
  ],
}
