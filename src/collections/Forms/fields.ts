import type { Field } from 'payload'

import { CONTACT_EMAIL } from '@/lib/contact'
import { managersOnlyFieldAccess } from '@/plugins/access'

/**
 * The `forms` field list, as `formOverrides.fields` hands it to us.
 *
 * Two jobs:
 *
 * 1. **Strip `emails`.** The plugin's own `sendEmail` afterChange hook fires on
 *    create, before anything screens the submission, and sends through the raw
 *    `payload.sendEmail` rather than this repo's branded React Email templates.
 *    With no `emails` on a form, no email can be authored — so there is
 *    provably none to send, and no `beforeEmail` hook silently swallows a
 *    message anyone wrote. All delivery belongs to the queue (#695 Phase 2).
 *
 *    ⚠ Stripping the field does **not** disable the hook. `sendEmail` loads
 *    `data.form` and spreads `data.submissionData` before it looks at `emails`,
 *    so on a registration or proposal it throws first. `formsPlugin`
 *    (`src/plugins/formBuilder/index.ts`) removes the hook, and states why.
 * 2. **Add `actionType`** and the two fields conditional on it, so a form
 *    declares what a submission against it *is* rather than leaving that to
 *    whichever client happens to post it.
 */
export function formFields({ defaultFields }: { defaultFields: Field[] }): Field[] {
  const withoutEmails = defaultFields.filter(
    (field) => !('name' in field && field.name === 'emails'),
  )

  return [...withoutEmails, actionTypeField, recipientField, clientField]
}

/**
 * What a submission against this form is. Drives the submission's `type`, the
 * per-type `beforeValidate` rules on `user-submissions`, and delivery.
 *
 * `registration` and `proposal` are deliberately absent: those rows carry an
 * `event` rather than a `form`, and nobody authors a form for them.
 */
const actionTypeField: Field = {
  name: 'actionType',
  type: 'select',
  required: true,
  defaultValue: 'contact',
  index: true,
  options: [
    { label: 'Contact message', value: 'contact' },
    { label: 'Mailing-list subscription', value: 'subscribe' },
  ],
  admin: {
    description:
      'Contact forms deliver the message to a recipient. Subscribe forms add the sender to a client’s mailing list.',
  },
}

/**
 * Who a contact submission is delivered to.
 *
 * Nullable on purpose. A null recipient falls back to `CONTACT_EMAIL`, so a
 * form whose author never names one still has somewhere to deliver.
 *
 * ⚠ **`managersOnlyFieldAccess` is the security boundary here, not a nicety.**
 * `forms` carries the form-builder plugin's own `read: () => true`, so any
 * caller reads a form — and `managers` is in no project, which
 * `isCollectionVisibleInProject` treats as shared rather than restrictive. A
 * read at `depth >= 1` would therefore hand a manager's name and email address
 * to a browser. Same lock, same reason, as `Clients.mailingList`
 * (`docs/rules/access.md`). Delivery is unaffected: `recipientFor` resolves it
 * server-side with `overrideAccess: true`.
 */
const recipientField: Field = {
  name: 'recipient',
  type: 'relationship',
  relationTo: 'managers',
  access: {
    read: managersOnlyFieldAccess,
    create: managersOnlyFieldAccess,
    update: managersOnlyFieldAccess,
  },
  admin: {
    condition: (_data, siblingData) => siblingData?.actionType === 'contact',
    description: `Who receives messages from this form. Leave blank to send to ${CONTACT_EMAIL}.`,
  },
}

/**
 * Whose mailing list a subscribe submission joins.
 *
 * Required for `subscribe` — a subscription with no list to join has nowhere to
 * be delivered. The provider credentials it resolves to (`Clients.mailingList`)
 * arrive in Phase 2; until then this is the target, and nothing reads it.
 *
 * ⚠ That requirement lives in `validateFormAction`, **not** in `required: true`
 * here. A required relationship makes the column `NOT NULL`, and a migration
 * that adds a `NOT NULL` column to a table with rows aborts the boot migration
 * on every environment carrying cloned production data. The rule is per-action
 * anyway, which no column constraint can express.
 */
const clientField: Field = {
  name: 'client',
  type: 'relationship',
  relationTo: 'clients',
  admin: {
    condition: (_data, siblingData) => siblingData?.actionType === 'subscribe',
    description: 'Whose mailing list a subscriber joins.',
  },
}
