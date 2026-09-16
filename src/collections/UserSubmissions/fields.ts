import type {
  Field,
  FieldAccess,
  RelationshipField,
  RelationshipFieldSingleValidation,
  Validate,
} from 'payload'

import { relationship as relationshipValidation } from 'payload/shared'
import { z } from 'zod'

import { logField } from '@/fields'
import { jsonField } from '@/fields/jsonField'
import type { UserSubmission } from '@/payload-types'

/**
 * What a submission *is*. Every access rule, policy branch and retention window
 * keys on this.
 *
 * `contact` and `subscribe` come from an authored `forms` document.
 * `registration` and `proposal` name an `event` instead — nobody authors a form
 * for them.
 *
 * The list is the runtime value `typeField` builds its select from, so the
 * column is generated *from* it. Read the union back off
 * `UserSubmission['type']` at a call site, never restated
 * (`src/types/AGENTS.md`): an option added here without a `TYPE_LABELS` or
 * `TYPE_SUBMISSION_KEYS` entry is then a compile error rather than an
 * `undefined` at runtime.
 */
export const SUBMISSION_TYPES = ['contact', 'subscribe', 'registration', 'proposal'] as const

/** The types that must carry a `form`. The other two carry an `event`. */
export const FORM_BACKED_TYPES: readonly UserSubmission['type'][] = ['contact', 'subscribe']

/** What each type is called wherever an admin meets it. */
export const TYPE_LABELS: Record<UserSubmission['type'], string> = {
  contact: 'Contact Message',
  subscribe: 'Subscription',
  registration: 'Registration',
  proposal: 'Event Proposal',
}

/**
 * One five-state vocabulary for every type, replacing three per-collection sets.
 *
 * `pending` → nothing has decided yet. That covers both "screening is still
 * running" and "screening passed, a human has not looked" — the two are told
 * apart by whether `screeningResult` exists, not by a sixth status.
 *
 * `accepted` / `rejected` are terminal **human** decisions. `rejected` is a
 * manager's decline and nothing else.
 *
 * ⚠ `spam` is the machine's refusal, and it is a separate status precisely so
 * nothing has to re-derive who refused a row. Abuse counting selects it, and a
 * manager's decline is never a spam strike against the person who wrote in.
 * Which check refused stays in `screeningResult.verdict`, for the reader.
 *
 * `failed` is the retryable one, carried over from user-messages: the decision
 * went fine and the delivery did not. It is not terminal, and it is the state
 * nobody else would notice.
 */
const SUBMISSION_STATUSES = ['pending', 'accepted', 'rejected', 'spam', 'failed'] as const

/**
 * What each status is called, in the list column and the `status` select alike.
 * One definition, so a row and the document it opens never disagree.
 */
const STATUS_LABELS: Record<UserSubmission['status'], string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  spam: 'Spam',
  failed: 'Failed',
}

/**
 * System/workflow fields must never be set by the submitting client. The
 * built-in create endpoint would otherwise let a forged body skip screening
 * (`status: 'accepted'`), attribute a submission to another service (`client`),
 * or mint an identifier of its choosing (`uuid`). Admins don't hand-edit them
 * either, so both grants are simply closed for client writes — the same guard,
 * and the same reasoning, as the three collections this replaces.
 */
const systemFieldAccess: { create: FieldAccess; update: FieldAccess } = {
  create: ({ req }) => req.user?.collection !== 'clients',
  update: ({ req }) => req.user?.collection !== 'clients',
}

/**
 * The `user-submissions` field list, as `formSubmissionOverrides.fields` hands
 * it to us.
 *
 * The plugin contributes two fields and we keep both: `submissionData` (the
 * `[{ field, value }]` pairs) and `form`. Everything else here is a real
 * column, and the split is the whole design — **`submissionData` is
 * client-writable as one blob**, so field-level access cannot protect anything
 * inside it, and Payload cannot pair `field`/`value` conditions on one array
 * element. Nothing queryable, unique, relational or system-gated may live
 * there. What is left for it is the flat free-form remainder, bounded by
 * `checkSubmissionData` instead of by a schema (see `submissionData.ts`).
 */
export function userSubmissionFields({ defaultFields }: { defaultFields: Field[] }): Field[] {
  return [
    typeField,
    subjectField,
    ...defaultFields.map(perTypeForm),
    senderEmailField,
    statusField,
    eventField,
    startingAtField,
    eventFeedbackField,
    proposedField,
    screeningResultField,
    activityLogField,
    systemGroup,
  ]
}

/** What this submission is. Every access rule and policy branch keys on it. */
const typeField: Field = {
  name: 'type',
  type: 'select',
  required: true,
  defaultValue: 'contact',
  index: true,
  options: SUBMISSION_TYPES.map((value) => ({ label: TYPE_LABELS[value], value })),
  enumName: 'enum_user_submissions_type',
  // Settable on create — it is how a caller chooses the intake — and immutable
  // after. `admin.readOnly` is the admin UI only, and every access rule and
  // retention window keys on this column: `managerSubmissionScope` narrows a
  // manager's reads by it, and a manager holds `update`. A system writer
  // needing to change it passes `overrideAccess`.
  access: { update: () => false },
  admin: { readOnly: true },
}

/**
 * The admin title, composed on create by `prepareUserSubmission`.
 *
 * The column itself is never written by a client — `systemFieldAccess` denies
 * it — so a submitter cannot name their own row outright.
 *
 * ⚠ **It is composed from submitter text all the same.** A contact subject is
 * the form's title joined with the sender's own `subject` pair
 * (`composeSubject`, `hooks/prepareUserSubmission.ts`), so unreviewed text does
 * reach an admin's list view. That is bounded rather than trusted: the pair is
 * URL-scanned by `urlScannablePairs`, capped by the `submissionData` bound, and
 * the column truncates to 300. Treat the value as untrusted when you render it
 * anywhere new.
 */
const subjectField: Field = {
  name: 'subject',
  type: 'text',
  maxLength: 300,
  access: systemFieldAccess,
  admin: { readOnly: true, description: 'Composed when the submission arrives.' },
}

/**
 * When a submission must name a form: the two form-backed types, minus the one
 * exemption.
 *
 * A subscribe row spawned by a registration opt-in has no form of its own —
 * nobody authored one, and the target list resolves from the provenance client
 * at delivery time. It carries the registration's `event` instead, which is
 * both the exemption's condition and the link back to the row that created it
 * (`hooks/spawnSubscribeFromRegistration.ts`). A contact submission never
 * qualifies: it has nowhere to go without a form's `recipient`.
 */
function needsForm(data?: { event?: unknown; type?: unknown }): boolean {
  const type = data?.type
  if (typeof type !== 'string') return false
  if (!(FORM_BACKED_TYPES as readonly string[]).includes(type)) return false
  return !(type === 'subscribe' && data?.event != null)
}

/**
 * Turn the plugin's unconditionally-required `form` relationship into a
 * per-type one.
 *
 * **The requirement is `required` plus `admin.condition`, not a hand-written
 * branch.** Both halves hold on the API path, which is the only path that
 * matters here — this collection exists for public intake, and nothing arrives
 * through the admin form:
 *
 * - `admin.condition` is evaluated **server-side**, not only in the browser:
 *   `payload/dist/fields/hooks/beforeChange/promise.js` computes
 *   `passesCondition` and then `skipValidationFromHere = skipValidation ||
 *   !passesCondition`. So a false condition skips `required` for a REST or
 *   Local API write exactly as it hides the field in the admin. The sibling it
 *   reads is already settled: field `beforeValidate` back-fills an omitted
 *   `type` from the stored row (or from `defaultValue` on create) before this
 *   runs, so a partial update is judged on the type the row actually has.
 * - A `required` field **carrying a condition is not made `NOT NULL`**
 *   (`@payloadcms/drizzle/dist/schema/traverseFields.js`: `if (!disableNotNull
 *   && field.required && !field.admin?.condition)`). The column stays nullable
 *   for the two types that never have a form, so this needs no migration —
 *   which is what makes `required` usable here at all.
 *
 * What a condition cannot express is the **prohibition**: a false condition
 * skips validation rather than refusing a value, so a registration POSTing a
 * `form` would simply store it. That half lives on `eventField`, whose own
 * condition is true for exactly the types it applies to.
 *
 * Two validators are **composed with, not replaced** — supplying a validator
 * replaces whatever was there (`src/collections/AGENTS.md`). Payload's own
 * relationship validation is what reads `required`, and the plugin's is a
 * `findByID` proving the form exists; dropping either would let a submission
 * skip the requirement, or name a form id that never existed.
 */
function perTypeForm(field: Field): Field {
  if (!('name' in field) || field.name !== 'form' || field.type !== 'relationship') return field

  const formExists = field.validate as Validate | undefined

  const validate: RelationshipFieldSingleValidation = async (value, options) => {
    const shape = await relationshipValidation(value, options)
    if (shape !== true) return shape

    return formExists ? formExists(value, options) : true
  }

  // `RelationshipField['validate']` is a union of the hasMany and single
  // signatures, and a function assignable to one is assignable to neither as
  // written. The cast picks the single form, which is what this field is.
  return {
    ...field,
    required: true,
    index: true,
    validate,
    admin: { ...field.admin, condition: (data) => needsForm(data) },
  } as RelationshipField
}

/**
 * The sender's address. Indexed: screening counts a sender's recent history
 * **across every type**, which is the whole reason for one table — a sender
 * hitting contact, proposals and registrations is one history, and no
 * per-collection design can express that.
 */
const senderEmailField: Field = {
  name: 'senderEmail',
  type: 'email',
  index: true,
  admin: { description: 'Who sent this. Normalized.' },
}

/** One four-state vocabulary for every type. `SUBMISSION_STATUSES` says what each means. */
const statusField: Field = {
  name: 'status',
  type: 'select',
  required: true,
  defaultValue: 'pending',
  index: true,
  options: SUBMISSION_STATUSES.map((value) => ({ label: STATUS_LABELS[value], value })),
  enumName: 'enum_user_submissions_status',
  access: systemFieldAccess,
  admin: { readOnly: true },
}

/**
 * The other half of the form/event split — and the half no condition can carry.
 *
 * `needsForm` states when a form is **needed**, and `required` enforces it. It
 * cannot state when one is **forbidden**: a false `admin.condition` skips
 * validation rather than refusing a value, so a registration POSTing a `form`
 * to the REST API would store it unchallenged. An API client is not the admin
 * form, and this collection only ever meets API clients.
 *
 * So the prohibition is asserted here, on the field whose own condition is true
 * for exactly the types it covers — everything but `contact`, which is the one
 * type that may never name an event. `subscribe` reaches this and is let
 * through: it may carry a form, an event, or (for a spawned row) an event
 * alone.
 *
 * Payload's own relationship validation is composed rather than replaced, so
 * the id-shape check that answers a malformed `event` with a 400 survives
 * (`src/collections/AGENTS.md`).
 */
const eventPlacement: RelationshipFieldSingleValidation = async (value, options) => {
  const shape = await relationshipValidation(value, options)
  if (shape !== true) return shape

  const data = options?.data as { form?: unknown; type?: UserSubmission['type'] } | undefined
  const type = data?.type

  if (type != null && !FORM_BACKED_TYPES.includes(type) && data?.form != null) {
    return `A ${type} submission names an event, not a form.`
  }

  return true
}

/**
 * The event a registration attends, or a proposal targets.
 *
 * **Nullable even for those two, and deliberately not `required`**: a proposal
 * for a brand-new event has no target yet, which is the whole point of the
 * type, and a registration may be recorded before its occurrence is resolved.
 * `required` here — under any condition — would refuse both.
 *
 * Indexed because fullness counts, the reminder sweep and the feedback roll-up
 * all query it.
 *
 * A **subscribe** row carries one too when a registration opt-in spawned it —
 * that is what links the consent record back to the registration it came from,
 * and what exempts it from needing a form of its own (`needsForm`).
 *
 * ⚠ **The condition is `type !== 'contact'`, not `… && !data?.form`.** Adding
 * the form clause would switch `eventPlacement` off for precisely the rows it
 * judges — one naming both a form and an event — and a skipped validator
 * refuses nothing.
 */
const eventField: Field = {
  name: 'event',
  type: 'relationship',
  relationTo: 'events',
  index: true,
  validate: eventPlacement,
  admin: {
    condition: (data) => data?.type !== 'contact',
    description:
      'The event this registration attends, this proposal targets, or this subscription came from.',
  },
} as RelationshipField

/**
 * When the registrant is attending.
 *
 * A real timezone-aware date rather than a `submissionData` pair: type fidelity
 * does not survive a textarea, and both the reminder job and the admin read it.
 */
const startingAtField: Field = {
  name: 'startingAt',
  type: 'date',
  timezone: true,
  admin: {
    condition: (data) => data?.type === 'registration',
    date: { pickerAppearance: 'dayAndTime' },
    description: 'Which occurrence the registrant is attending.',
  },
}

/**
 * The registrant's confirm/deny verdict on an unverified event.
 *
 * System-gated: its only writer is the CMS-hosted `/registrations/feedback`
 * page, which records a vote on an explicit button press behind a signed token.
 * No API client may write it — a mutating GET link would be auto-followed by
 * email security scanners, which is why the page exists at all.
 */
const eventFeedbackField: Field = {
  name: 'eventFeedback',
  type: 'select',
  options: [
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Denied', value: 'denied' },
  ],
  enumName: 'enum_user_submissions_event_feedback',
  access: systemFieldAccess,
  admin: {
    condition: (data) => data?.type === 'registration',
    description: 'Registrant’s verdict on an unverified event.',
  },
}

/**
 * The `proposed` column: a nested Events field patch, exactly as submitted.
 *
 * **Deliberately open**, and that is the interesting decision. Every other JSON
 * column here closes its shape, because a single internal writer owns it. This
 * one is written by the public, and the keys it may carry are *derived from the
 * live Events config* — `proposableEventFields` walks `flattenedFields` and
 * refuses anything privileged or system-written. Enumerating those keys here
 * would give the rule two definitions, and the copy in this file would go stale
 * the first time somebody added a field to Events.
 *
 * So the schema carries what a schema can carry — it is an object, not an array
 * or a scalar, and it is bounded — and the key gate stays in `validateProposal`.
 * That split is forced as well as chosen: supplying a custom `validate`
 * **replaces** the built-in validator that runs the schema
 * (`src/collections/AGENTS.md`), so the two cannot both live on the field. A
 * `beforeValidate` hook composes with the schema instead of displacing it.
 *
 * Declaring it still buys the half a hook cannot: `generate:types` reads the
 * schema, so consumers get an object type rather than
 * `{ [k: string]: unknown } | unknown[] | string | number | boolean | null`,
 * and a caller posting `"proposed": "hello"` is refused at the collection
 * rather than three files away.
 *
 * It also cannot be a `submissionData` pair: it is a nested structure (an
 * address group, a schedule), and flattening it into a textarea would lose the
 * validation, the diff UI, and every typed read.
 */
const proposedField: Field = jsonField({
  name: 'proposed',
  schemaTitle: 'SubmissionProposal',
  // `z.looseObject`, not a value schema: a proposal nests (an address group, a
  // schedule), so no single value type describes it. It emits
  // `additionalProperties: {}` — the same `[k: string]: unknown` a consumer
  // must narrow anyway. `.meta` carries the bound Zod has no method for: a real
  // proposal touches a handful of Events fields, and nothing legitimate
  // approaches 60.
  schema: z.looseObject({}).meta({ maxProperties: 60 }),
  admin: {
    condition: (data) => data?.type === 'proposal',
    readOnly: true,
    description: 'The proposed Events field patch, exactly as submitted.',
  },
})

/**
 * Why a submission was refused, or `ok`. One reason — the first check that hit.
 *
 * The union of what the two screening jobs recorded separately, minus the
 * per-collection wording: the copy that made them un-shareable lived in the
 * notes, and the notes are composed by the job, which knows the domain.
 *
 * A runtime list as well as the schema's enum, because the verdict is read back
 * out of a JSON column — a value outside this list means the column holds
 * something this code did not write. Read the **type** off
 * `SubmissionScreeningResult['verdict']` in `@/payload-types`, which this list
 * generates; there is no alias to import (`src/types/AGENTS.md`).
 */
export const SUBMISSION_VERDICTS = [
  'ok',
  'disposable_email',
  'invalid_email',
  'no_mx_records',
  'repeat_sender',
  'duplicate_body',
  'content_rejected',
] as const

/**
 * **Which** check refused this row, and what to tell a manager about it.
 * Written by the (Phase 2) screening job alone.
 *
 * ⚠ **Whether the machine refused it is `status: 'spam'`, not this column.**
 * That is what abuse counting selects — an indexed column a query can reach,
 * where a JSON path is not a cheap predicate. This column is the reason
 * alongside it, for the reader and for triage.
 *
 * Closed (`z.strictObject`) because only that job writes here — an unknown key
 * is a bug in the job, never an older server meeting a newer client — and
 * `verdict`/`screenedAt` are required for the same reason: nothing has been
 * written under an earlier shape, because the column is new.
 */
const screeningResultField: Field = jsonField({
  name: 'screeningResult',
  label: 'Screening',
  schemaTitle: 'SubmissionScreeningResult',
  // `.describe()`, not a `//` comment: it becomes JSDoc on the generated type.
  schema: z.strictObject({
    verdict: z
      .enum(SUBMISSION_VERDICTS)
      .describe('`ok`, or the first check that refused this submission.'),
    notes: z
      .array(z.string())
      .describe(
        'Everything an admin needs, as complete sentences: what happened and what follows from it. An accepted submission normally has none.',
      )
      .optional(),
    diagnostic: z
      .string()
      .describe(
        'A technical detail kept for triage and NOT rendered — an inconclusive MX lookup, or a transport’s own error string.',
      )
      .optional(),
    screenedAt: z.string().describe('When screening reached this verdict (ISO 8601).'),
  }),
  access: systemFieldAccess,
  admin: { readOnly: true },
})

/**
 * Everything recorded about this submission. Promoted to every type here: the
 * three collections being replaced logged ad hoc, or not at all.
 */
const activityLogField: Field = logField({
  description: 'Everything recorded about this submission — screening, delivery, decisions.',
  columns: [
    { key: 'activity', label: 'Event' },
    { key: 'sentTo', label: 'Sent to' },
  ],
})

/** The columns a reader needs only when something has gone wrong. */
const systemGroup: Field = {
  label: 'System',
  type: 'collapsible',
  admin: { initCollapsed: true },
  fields: [
    {
      // The stable public identifier, issued at create and returned to the
      // caller. `unique` already creates the index.
      name: 'uuid',
      label: 'Identifier',
      type: 'text',
      unique: true,
      access: systemFieldAccess,
      admin: { readOnly: true },
    },
    {
      // Which service relayed this, taken from the authenticated key and never
      // from the body — it brands the emails sent about the submission, so a
      // caller able to set it could attribute its rows to another service.
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      index: true,
      access: systemFieldAccess,
      admin: { readOnly: true },
    },
    {
      // The person, upserted from the normalized `senderEmail` for **every**
      // type. Grants nothing — it exists so a sender's history is one history,
      // and so `Users` can show everything one person has ever sent.
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      access: systemFieldAccess,
      admin: { readOnly: true },
    },
    {
      // Deliberately generic, and registration-only for now: a future
      // subscribe-type unsubscribe reuses the same column. Queried by the
      // reminder sweep, written by the unsubscribe token flow.
      name: 'unsubscribedAt',
      type: 'date',
      index: true,
      access: systemFieldAccess,
      admin: { readOnly: true },
    },
    {
      // The follow-up sweep's query filter. `activityLog` records *that* it was
      // sent, but nothing can `where` on a JSON column cheaply, so the scan
      // still needs a real dated column. Record and filter are different jobs.
      name: 'followUpSentAt',
      type: 'date',
      access: systemFieldAccess,
      admin: { hidden: true },
    },
  ],
}
