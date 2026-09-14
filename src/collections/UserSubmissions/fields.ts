import type { JSONSchema4 } from 'json-schema'
import type { Field, FieldAccess, RelationshipField, Validate } from 'payload'

import { logField } from '@/fields'

import { screeningResultJsonSchema } from './screening'
import {
  FORM_BACKED_TYPES,
  STATUS_LABELS,
  SUBMISSION_STATUSES,
  SUBMISSION_TYPES,
  TYPE_LABELS,
  type SubmissionType,
} from './types'

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
 * Turn the plugin's unconditionally-required `form` relationship into a
 * per-type one.
 *
 * `required: true` is dropped rather than kept, for two reasons that both bite:
 * a registration or proposal row has no form at all, and the column must be
 * nullable to hold one; and Payload's `required` is a column-level `NOT NULL`,
 * which cannot express "for two of four types". The rule moves into `validate`,
 * which sees the sibling `type`.
 *
 * The plugin's own validator — a `findByID` proving the form exists — is
 * **composed with, not replaced**: supplying a validator replaces whatever was
 * there, and dropping that check would let a submission name a form id that
 * never existed (`src/collections/AGENTS.md`).
 */
function perTypeForm(field: Field): Field {
  if (!('name' in field) || field.name !== 'form' || field.type !== 'relationship') return field

  const formExists = field.validate as Validate | undefined

  const validate: Validate = async (value, options) => {
    const type = (options?.data as { type?: SubmissionType } | undefined)?.type

    if (type != null && !FORM_BACKED_TYPES.includes(type)) {
      return value == null ? true : `A ${type} submission names an event, not a form.`
    }

    if (value == null) {
      return `A ${type ?? 'contact'} submission needs the form it was sent from.`
    }

    return formExists ? formExists(value, options) : true
  }

  // `RelationshipField['validate']` is a union of the hasMany and single
  // signatures, and a function assignable to one is assignable to neither as
  // written. The cast picks the single form, which is what this field is.
  return { ...field, required: false, index: true, validate } as RelationshipField
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
  admin: { description: 'Who sent this. Normalized, and what `user` is upserted from.' },
}

/** One four-state vocabulary for every type. See `types.ts` for what each means. */
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
 * The event a registration attends, or a proposal targets.
 *
 * Nullable even for those two: a proposal for a brand-new event has no target
 * yet. Indexed because fullness counts, the reminder sweep and the feedback
 * roll-up all query it.
 */
const eventField: Field = {
  name: 'event',
  type: 'relationship',
  relationTo: 'events',
  index: true,
  admin: {
    condition: (data) => data?.type === 'registration' || data?.type === 'proposal',
    description: 'The event this registration attends, or this proposal targets.',
  },
}

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
const proposedJsonSchema: JSONSchema4 = {
  $id: 'urn:sahajcloud:schema:submission-proposed',
  title: 'SubmissionProposal',
  type: 'object',
  // Bounds a public blob without naming its keys. A real proposal touches a
  // handful of Events fields; nothing legitimate approaches this.
  maxProperties: 60,
  // `true`, not a value schema: a proposal nests (an address group, a
  // schedule), so no single value type describes it. `true` generates
  // `[k: string]: unknown`, which is what a consumer must narrow anyway.
  additionalProperties: true,
}

const proposedField: Field = {
  name: 'proposed',
  type: 'json',
  jsonSchema: {
    uri: 'urn:sahajcloud:schema:submission-proposed',
    fileMatch: ['urn:sahajcloud:schema:submission-proposed'],
    schema: proposedJsonSchema,
  },
  admin: {
    condition: (data) => data?.type === 'proposal',
    readOnly: true,
    description: 'The proposed Events field patch, exactly as submitted.',
  },
}

/**
 * Screening's verdict — and the only place the machine's judgement is
 * recorded, now that `status` folds spam and a human decline into `rejected`.
 * Written by the (Phase 2) screening job alone.
 */
const screeningResultField: Field = {
  name: 'screeningResult',
  type: 'json',
  label: 'Screening',
  jsonSchema: {
    uri: 'urn:sahajcloud:schema:submission-screening-result',
    fileMatch: ['urn:sahajcloud:schema:submission-screening-result'],
    schema: screeningResultJsonSchema,
  },
  access: systemFieldAccess,
  admin: { readOnly: true },
}

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
