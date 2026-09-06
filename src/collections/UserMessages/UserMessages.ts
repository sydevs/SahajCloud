import type { JSONSchema4 } from 'json-schema'
import type { CollectionConfig, FieldAccess } from 'payload'

import { enqueueUserMessageScreening } from './hooks/enqueueUserMessageScreening'
import { prepareUserMessage } from './hooks/prepareUserMessage'
import { screeningResultJsonSchema } from './screening'
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

/**
 * Caller-supplied context attached to a message — the page path, the host URL,
 * a crash stack. Payload compiles this to a write-time validator **and**
 * generates `UserMessage['context']` from it, so the shape has exactly one
 * definition (`src/lib/registrations/questions.ts` is the same pattern).
 *
 * `additionalProperties` stays **open**: the contract accepts keys this server
 * doesn't know, so a newer client sending a field an older CMS has never heard
 * of still gets its message through. `false` would turn that into a 400.
 *
 * ⚠ It is `true` rather than `{ type: 'string' }`, and that is a TypeScript
 * constraint rather than a preference. A typed `additionalProperties` generates
 * an index signature — `[k: string]: string` — and TypeScript then requires
 * every named property to be assignable to it. These are all optional, so
 * `string | undefined` is not, and the generated file does not compile. `true`
 * generates `[k: string]: unknown`, which optional members satisfy.
 *
 * The consequence, recorded rather than hidden: `maxProperties` bounds how many
 * keys a caller may send and the named ones carry a `maxLength`, but an unknown
 * key's value is unbounded. The serialized-length validator that used to cover
 * that was dropped deliberately (review of #653) — the size cap is not worth a
 * hand-written validator beside a schema.
 */
const contextJsonSchema: JSONSchema4 = {
  type: 'object',
  maxProperties: 20,
  properties: {
    // `description`, not a `//` comment: Payload renders these into the JSDoc on
    // the generated type, which is what keeps the per-key documentation the
    // hand-written `UserMessageContext` used to carry.
    path: {
      type: 'string',
      maxLength: 2000,
      description: 'Route the sender was on, e.g. `/events/london-meetup`.',
    },
    hostUrl: {
      type: 'string',
      maxLength: 2000,
      description: 'Absolute URL of the host page embedding the widget.',
    },
    locale: {
      type: 'string',
      maxLength: 2000,
      description: 'Locale the sender was browsing in.',
    },
    error: {
      type: 'string',
      maxLength: 2000,
      description: 'Error text/stack the sender was reporting, when the message is a crash report.',
    },
    userAgent: {
      type: 'string',
      maxLength: 2000,
      description: "The sender's user-agent string.",
    },
  },
  additionalProperties: true,
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
      // Closed, unlike `context`: only ScreenUserMessages writes this column, so
      // an unknown key or a bad verdict is a bug in the job rather than an older
      // server meeting a newer client. Generates the type the job and the admin
      // banner both read.
      jsonSchema: {
        uri: 'urn:sahajcloud:schema:user-message-screening-result',
        fileMatch: ['urn:sahajcloud:schema:user-message-screening-result'],
        schema: screeningResultJsonSchema,
      },
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
      // A report, not a document — and a two-character "hi" is noise. Both
      // bounds are the built-in ones: a custom `validate` would REPLACE the
      // default that enforces them (`src/collections/AGENTS.md`).
      maxLength: 5000,
      minLength: 10,
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
      jsonSchema: {
        uri: 'urn:sahajcloud:schema:user-message-context',
        fileMatch: ['urn:sahajcloud:schema:user-message-context'],
        schema: contextJsonSchema,
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
