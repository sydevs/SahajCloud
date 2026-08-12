import type { CollectionConfig, FieldAccess } from 'payload'

import { addressFields, urlField } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'

import { reviewSubmission } from './endpoints/review'
import { enqueueScreening } from './hooks/enqueueScreening'
import { prepareSubmission } from './hooks/prepareSubmission'

/**
 * Workflow states. `screening` → the async ScreenEventSubmissions job is (or
 * will be) checking the submitter's email + resolving the region; `pending` →
 * awaiting a manager's review; the rest are terminal and double as the outcome
 * record: `spam` (kept for abuse tracking, never notified), `created` (a new
 * Event was created — `event` points at it), `updated` (the proposal was
 * applied to the existing `event`), `rejected`.
 */
export const SUBMISSION_STATUSES = [
  'screening',
  'pending',
  'spam',
  'created',
  'updated',
  'rejected',
] as const

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number]

/** Statuses a submission can still be acted on from (Accept / Reject shown). */
export const OPEN_SUBMISSION_STATUSES: readonly SubmissionStatus[] = ['screening', 'pending']

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  screening: 'Screening',
  pending: 'Pending Review',
  spam: 'Spam',
  created: 'Accepted — Event Created',
  updated: 'Accepted — Event Updated',
  rejected: 'Rejected',
}

/**
 * System/workflow fields must never be set by the submitting client — the
 * built-in create endpoint would otherwise let a forged body skip screening
 * (`status: 'pending'`) or claim a submitter. Managers don't hand-edit them
 * either (the accept/reject ops write them via overrideAccess, which skips
 * field access), so both grants are simply closed for non-admin API writes.
 */
const systemFieldAccess: { create: FieldAccess; update: FieldAccess } = {
  create: ({ req }) => req.user?.collection !== 'clients',
  update: ({ req }) => req.user?.collection !== 'clients',
}

/**
 * EventSubmissions — the intake for community contributions to the Atlas map
 * (#624 follow-on): anonymous visitors submit **new events** or **update
 * proposals for an existing event** through the Atlas widget, which POSTs the
 * built-in create endpoint with its client key. Nothing here mutates a live
 * listing: a submission is data *about* a change, reviewed by a manager whose
 * Accept applies it (creates the Event as published+unverified, or patches the
 * target event) and whose Reject shelves it.
 *
 * `event` set ⇒ update proposal (and, after acceptance of a new-event
 * submission, the created event). `event` unset ⇒ new event.
 *
 * Guard rails around the public intake:
 * - the write-guard plugin (Turnstile header, URL scan, disposable-email list)
 *   runs beforeValidate on client creates;
 * - clients hold **create only** — the collection is RESTRICTED (see
 *   `@/plugins/access/config/projects.ts`), so no implicit read ever exposes
 *   submitter emails through the public client key;
 * - the async ScreenEventSubmissions job then classifies spam (MX lookup +
 *   list re-check), resolves the region, and notifies the responsible manager.
 *
 * There is deliberately no `title` field: an accepted event keeps the target's
 * title or lets the Events auto-title hook name it from the venue.
 */
export const EventSubmissions: CollectionConfig = {
  slug: 'event-submissions',
  labels: { singular: 'Event Submission', plural: 'Event Submissions' },
  admin: {
    group: 'Classes',
    useAsTitle: 'submitterName',
    defaultColumns: ['submitterName', 'status', 'event', 'createdAt'],
    components: {
      edit: {
        // Accept / Reject replace Save while the submission is open — Accept
        // saves the form first, then applies the review (see the component).
        SaveButton: '@/components/admin/EventSubmissionSaveButton',
      },
    },
  },
  hooks: {
    beforeChange: [prepareSubmission],
    afterChange: [enqueueScreening],
  },
  endpoints: [reviewSubmission],
  fields: [
    {
      // Status banner + Accept/Reject context, rendered above the fields.
      name: 'eventSubmissionNotice',
      type: 'ui',
      admin: { components: { Field: '@/components/admin/EventSubmissionNotice' } },
    },
    {
      // Set ⇒ this is an update proposal for that event (and the target of an
      // Accept). For accepted new-event submissions the accept op points this
      // at the event it created, so one field answers "which event is this
      // submission about" in every terminal state.
      name: 'event',
      type: 'relationship',
      relationTo: 'events',
      admin: {
        description:
          'The event this submission proposes changes to. Leave empty for a brand-new event; after acceptance it links the created event.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'submitterName',
          type: 'text',
          required: true,
          maxLength: 200,
        },
        {
          name: 'submitterEmail',
          type: 'email',
          required: true,
        },
      ],
    },
    {
      name: 'submitterNote',
      type: 'textarea',
      maxLength: 1000,
      admin: {
        description: 'Anything the submitter wanted to tell the reviewing manager.',
      },
    },
    {
      name: 'languages',
      type: 'select',
      hasMany: true,
      options: getLanguageOptions(),
    },
    {
      name: 'eventType',
      type: 'select',
      // Mirrors the Events `eventType` enum — the accept op copies the value
      // across verbatim, so the two option sets must stay aligned.
      options: [
        { label: 'Offline', value: 'offline' },
        { label: 'Online', value: 'online' },
      ],
      enumName: 'enum_event_submissions_event_type',
    },
    urlField({
      name: 'onlineUrl',
      label: 'Online URL',
      maxLength: 500,
      admin: { condition: (data) => data?.eventType === 'online' },
    }),
    addressFields({
      label: false,
      hasVenueName: true,
      admin: { condition: (data) => data?.eventType !== 'online' },
    }),
    {
      type: 'row',
      fields: [
        { name: 'contactName', type: 'text', maxLength: 200 },
        { name: 'contactEmail', type: 'email' },
        { name: 'contactPhone', type: 'text', maxLength: 50 },
      ],
    },
    {
      // Plain text, NOT the Events lexical editor: this is a public form
      // field. The accept op wraps it into a minimal lexical tree.
      name: 'description',
      type: 'textarea',
      maxLength: 2000,
    },
    {
      // A deliberately simple schedule vocabulary for the public form —
      // one-off or simple weekly — mapped onto the real `scheduleFields`
      // group by the accept op. Bounds mirror the Events schedule sub-fields.
      name: 'schedule',
      type: 'group',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'scheduleType',
              type: 'select',
              options: [
                { label: 'One-off', value: 'one-off' },
                { label: 'Weekly', value: 'weekly' },
              ],
              enumName: 'enum_event_submissions_schedule_type',
            },
            { name: 'startDate', type: 'date' },
            { name: 'endDate', type: 'date' },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'startTime',
              type: 'text',
              validate: (value: string | null | undefined) =>
                !value || /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/.test(value)
                  ? true
                  : 'Enter time in HH:MM format (e.g., 09:00 or 14:30)',
            },
            {
              name: 'endTime',
              type: 'text',
              validate: (value: string | null | undefined) =>
                !value || /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/.test(value)
                  ? true
                  : 'Enter time in HH:MM format (e.g., 09:00 or 14:30)',
            },
            {
              name: 'weekdays',
              type: 'select',
              hasMany: true,
              options: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
              admin: { condition: (data) => data?.schedule?.scheduleType === 'weekly' },
            },
            { name: 'timezone', type: 'text', maxLength: 50 },
          ],
        },
      ],
    },
    {
      // Controlled region rollout: the client picks an EXISTING country (and
      // optionally state/region), or anchors to an existing city/venue it was
      // browsing. Only cities are ever auto-created (by the screening job,
      // canonicalized through Mapbox) — never countries, states, or venues.
      //
      // The level constraints are enforced in `prepareSubmission`, NOT via
      // `filterOptions`: Payload validates filterOptions on save with a find
      // that forwards the caller's `req`, and a client `req` trips the
      // select-required client-query gate — every public create would 400.
      type: 'row',
      fields: [
        {
          name: 'country',
          type: 'relationship',
          relationTo: 'regions',
          admin: {
            description:
              'Existing country the event belongs to (required for new events; must be a country-level region).',
          },
        },
        {
          name: 'state',
          type: 'relationship',
          relationTo: 'regions',
          admin: { description: 'Existing state/region, when known.' },
        },
        {
          name: 'anchorRegion',
          type: 'relationship',
          relationTo: 'regions',
          admin: {
            description:
              'Existing city or venue the submitter was browsing, when the widget knows it.',
          },
        },
      ],
    },
    {
      // Resolved by the screening job: the anchor when given, else the
      // matched-or-created city under `country`/`state`. What the accept op
      // attaches the event to.
      name: 'region',
      type: 'relationship',
      relationTo: 'regions',
      access: systemFieldAccess,
      admin: {
        readOnly: true,
        description: 'Resolved city/venue (set by screening).',
      },
    },
    {
      // The registrant row upserted from submitterName/Email — abuse tracking
      // and (later) submitter notifications. Grants nothing.
      name: 'submitter',
      type: 'relationship',
      relationTo: 'users',
      access: systemFieldAccess,
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'screening',
      options: SUBMISSION_STATUSES.map((value) => ({ label: STATUS_LABELS[value], value })),
      enumName: 'enum_event_submissions_status',
      access: systemFieldAccess,
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      // What the screening job found (email verdicts, region resolution
      // warnings) — rendered inside the notice, kept for triage.
      name: 'screeningResult',
      type: 'json',
      access: systemFieldAccess,
      admin: { hidden: true },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'reviewedBy',
          type: 'relationship',
          relationTo: 'managers',
          access: systemFieldAccess,
          admin: { readOnly: true },
        },
        {
          name: 'reviewedAt',
          type: 'date',
          access: systemFieldAccess,
          admin: { readOnly: true },
        },
      ],
    },
  ],
}
