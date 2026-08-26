import type { CollectionConfig, FieldAccess, TextareaFieldValidation } from 'payload'

import { textarea as validateTextarea } from 'payload/shared'

import { enqueueUserMessageScreening } from './hooks/enqueueUserMessageScreening'
import { prepareUserMessage } from './hooks/prepareUserMessage'
import { STATUS_LABELS, USER_MESSAGE_STATUSES } from './statuses'

export { USER_MESSAGE_STATUSES, type MessageStatus } from './statuses'

/**
 * System/workflow fields must never be set by the submitting client — the
 * built-in create endpoint would otherwise let a forged body skip screening
 * (`status: 'delivered'`) or attribute the message to another service
 * (`client`). Admins don't hand-edit them either, so both grants are simply
 * closed for non-admin API writes. Same guard, same reasoning, as
 * `EventSubmissions`.
 */
const systemFieldAccess: { create: FieldAccess; update: FieldAccess } = {
  create: ({ req }) => req.user?.collection !== 'clients',
  update: ({ req }) => req.user?.collection !== 'clients',
}

/** Longest message we accept. A report, not a document. */
const MESSAGE_MAX = 5000
/** Shortest. A two-character "hi" is noise, not a report. */
const MESSAGE_MIN = 10
/**
 * Cap on the serialized `context` blob. The keys are deliberately **not**
 * enumerated here: the original contract stripped unknown keys rather than
 * rejecting them, so a newer client sending a field this server doesn't know
 * yet still gets its message through. One total bound gives the protection that
 * actually matters on a public write path — no unbounded JSON — without
 * freezing the shape.
 */
const CONTEXT_MAX_SERIALIZED = 4000

/**
 * Supplying `validate` **replaces** Payload's default, which is what enforces
 * `maxLength` — so the built-in is composed in rather than reimplemented
 * (`.claude/rules/collections.md`). This adds only the floor, which no built-in
 * option expresses.
 */
const validateMessage: TextareaFieldValidation = (value, options) => {
  const builtIn = validateTextarea(value, options)
  if (builtIn !== true) return builtIn
  if (typeof value === 'string' && value.trim().length < MESSAGE_MIN) {
    return `Tell us a little more — at least ${MESSAGE_MIN} characters.`
  }
  return true
}

/**
 * UserMessages — the intake for messages a viewer sends us through a client
 * app: the Atlas widget's "Report an issue" form first, WeMeditateWeb's contact
 * surfaces next. Created by API clients through the **built-in create
 * endpoint** (`POST /api/user-messages`), which is what earns them the usage
 * plugin's origin enforcement and the write-guard's anti-spam policy for free —
 * both of which the `POST /api/contact-admin` root endpoint this replaces had
 * to hand-roll or forfeit (#602 → #632).
 *
 * A message is a **thing to deliver and then forget**, not a document to edit.
 * Nothing here is editable: an admin reads it, and the workflow moves it.
 *
 * Guard rails around the public intake:
 * - the write-guard plugin (Turnstile header, URL scan, disposable-email list)
 *   runs beforeValidate on client creates;
 * - clients hold **create only**, and the collection is RESTRICTED (see
 *   `@/plugins/access/config/projects.ts`), so no implicit read ever exposes a
 *   sender's address or words. No manager role grants it at all — reading these
 *   is an admin-bypass-only act, because they are unscreened messages from
 *   strangers about anything at all;
 * - the async ScreenUserMessages job then re-checks the address (disposable
 *   list + MX), counts the sender's recent history, and either delivers the
 *   message to the admins or files it as spam.
 *
 * Retention is real and short: PurgeUserMessages deletes delivered messages
 * after a week and spam after 90 days. `failed` is kept until somebody looks.
 */
export const UserMessages: CollectionConfig = {
  slug: 'user-messages',
  labels: { singular: 'User Message', plural: 'User Messages' },
  admin: {
    group: 'System',
    useAsTitle: 'subject',
    defaultColumns: ['subject', 'senderEmail', 'client', 'status', 'createdAt'],
  },
  hooks: {
    beforeChange: [prepareUserMessage],
    afterChange: [enqueueUserMessageScreening],
  },
  fields: [
    {
      // Status banner + screening verdict. Mounted on the data it renders
      // rather than on a `ui` field, so the component reads its own value
      // instead of reaching across form state. First field ⇒ renders on top.
      name: 'screeningResult',
      type: 'json',
      // The banner IS this message's status, so the field is labelled for what
      // a reader reads rather than for the column it happens to store.
      label: 'Status',
      access: systemFieldAccess,
      admin: {
        readOnly: true,
        components: { Field: '@/components/admin/UserMessages/UserMessageStatus' },
      },
    },
    {
      // The caller's own label for the channel, e.g. "Issue report" (Atlas).
      // This and `context` are what keep the intake reusable: WeMeditateWeb
      // sends its own label and its own context values with no schema change.
      name: 'subject',
      type: 'text',
      maxLength: 200,
      // Preserves the endpoint's `DEFAULT_SUBJECT`: a caller that sends no
      // label still produces a titled row rather than a blank one.
      defaultValue: 'Message',
      admin: { readOnly: true },
    },
    {
      name: 'message',
      type: 'textarea',
      required: true,
      maxLength: MESSAGE_MAX,
      validate: validateMessage,
      admin: { readOnly: true },
    },
    {
      // The sender's address, when they left one. Indexed: the screening job
      // counts a sender's recent messages, and `users` is upserted from this.
      name: 'senderEmail',
      type: 'email',
      index: true,
      admin: {
        readOnly: true,
        description: 'Optional. Becomes the Reply-To of the message we email out.',
      },
    },
    {
      // Whatever the caller wants recorded alongside the message — the page
      // path, the host URL, a crash stack. Rendered into the email's details
      // block, each row omitted when its value is absent.
      name: 'context',
      type: 'json',
      validate: (value: unknown) => {
        if (value == null) return true
        if (typeof value !== 'object' || Array.isArray(value)) {
          return 'Context must be an object.'
        }
        if (JSON.stringify(value).length > CONTEXT_MAX_SERIALIZED) {
          return `Context is too large (max ${CONTEXT_MAX_SERIALIZED} characters).`
        }
        return true
      },
      admin: { readOnly: true },
    },
    {
      // Which app relayed this. Taken from the authenticated key by
      // `prepareUserMessage`, never from the body — it names the message in the
      // list and prefixes the notification subject, so a client able to set it
      // could attribute its messages to another service.
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      index: true,
      access: systemFieldAccess,
      admin: { readOnly: true },
    },
    {
      // The person, upserted from `senderEmail`. Grants nothing — it exists so
      // screening can count a sender's recent history, and so abuse is visible
      // across both public intakes (cf. `EventSubmissions.submitter`).
      // Empty for an anonymous message.
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      access: systemFieldAccess,
      admin: { readOnly: true },
    },
    {
      label: 'System',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'screening',
          options: USER_MESSAGE_STATUSES.map((value) => ({ label: STATUS_LABELS[value], value })),
          enumName: 'enum_user_messages_status',
          access: systemFieldAccess,
          admin: { readOnly: true },
        },
        {
          // Fingerprint of the normalized body, stamped on create. Indexed
          // because the duplicate check is an equality lookup over recent rows.
          name: 'bodyHash',
          type: 'text',
          index: true,
          access: systemFieldAccess,
          admin: { readOnly: true },
        },
        {
          // When the notification actually went out. Distinct from `createdAt`:
          // the gap between them is how long screening took, and it is what the
          // retention sweep would use if delivery were ever slow enough to
          // matter.
          name: 'deliveredAt',
          type: 'date',
          access: systemFieldAccess,
          admin: { readOnly: true },
        },
      ],
    },
  ],
}
