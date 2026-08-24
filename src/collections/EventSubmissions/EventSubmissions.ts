import type { CollectionConfig, FieldAccess } from 'payload'

import { serverEnv } from '@/lib/env/server'

import { reviewSubmission } from './endpoints/review'
import { computePreviewEvent, computeProposedChanges } from './hooks/computeReviewFields'
import { enqueueScreening } from './hooks/enqueueScreening'
import { prepareSubmission } from './hooks/prepareSubmission'
import { submissionTitle } from './hooks/submissionTitle'
import { validateProposal } from './hooks/validateProposal'
import { STATUS_LABELS, SUBMISSION_STATUSES } from './statuses'

export {
  OPEN_SUBMISSION_STATUSES,
  SUBMISSION_STATUSES,
  type SubmissionStatus,
} from './statuses'

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
 * EventSubmissions — the intake for community contributions to the Atlas map:
 * anonymous visitors submit **new events** or **update proposals for an
 * existing event** through the Atlas widget, which POSTs the built-in create
 * endpoint with its client key.
 *
 * A submission is a **proposal to judge, not a document to edit**. It carries
 * one `proposed` patch keyed by real Events field names — no mirrored schema,
 * no translation layer — and the review view renders that patch three ways: the
 * diff against the target (`proposedChanges`), the resulting listing
 * (`previewEvent`, via live preview), and Accept / Reject. The only editable
 * fields are `region` — screening can fail to resolve one, and a reviewer has
 * to be able to fix it before accepting — and `manager`, which adopts a
 * created event in the same act. Both apply to new events only.
 *
 * `event` set ⇒ update proposal (and, after acceptance of a new-event
 * submission, the created event). `event` unset ⇒ new event.
 *
 * Guard rails around the public intake:
 * - the write-guard plugin (Turnstile header, URL scan, disposable-email list)
 *   runs beforeValidate on client creates, and `validateProposal` rejects any
 *   `proposed` key that isn't a proposable Events field;
 * - clients hold **create only** — the collection is RESTRICTED (see
 *   `@/plugins/access/config/projects.ts`), so no implicit read ever exposes
 *   submitter emails through the public client key;
 * - the async ScreenEventSubmissions job then classifies spam (MX lookup +
 *   list re-check), resolves the region, and notifies the responsible manager.
 */
export const EventSubmissions: CollectionConfig = {
  slug: 'event-submissions',
  labels: { singular: 'Event Submission', plural: 'Event Submissions' },
  admin: {
    group: 'Classes',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'createdAt'],
    components: {
      edit: {
        // Accept / Reject replace Save while the submission is open — nothing
        // on the page is editable except `region`, so there is no form to save
        // first (see the component).
        SaveButton: '@/components/admin/EventSubmissions/EventSubmissionActions',
      },
    },
    // Live Preview renders the event **as this submission would leave it**.
    // Unlike the Events preview, the widget cannot fetch the document back —
    // `event-submissions` is restricted to create-only for API clients, and a
    // new-event submission has no Event id to fetch. It doesn't need to:
    // Payload posts the document's form state into the iframe
    // (`payload-live-preview`), and `previewEvent` carries the merged event in
    // that payload. See `computeReviewFields.ts`.
    livePreview: {
      url: ({ data, locale }) =>
        data.id
          ? `${serverEnv.SAHAJATLAS_URL}/preview?collection=event-submissions&id=${data.id}&secret=${serverEnv.SAHAJCLOUD_PREVIEW_SECRET}&locale=${locale.code}`
          : null,
      breakpoints: [{ label: 'Mobile', name: 'mobile', width: 390, height: 844 }],
      // A reviewer is here to judge how a listing would look, so the panel is
      // open on arrival rather than a click away. Payload's own option (3.86):
      // it applies only until the reviewer toggles the panel themselves, after
      // which their stored preference wins — which a mount effect could not do.
      openByDefault: true,
    },
  },
  hooks: {
    beforeValidate: [validateProposal],
    // `submissionTitle` after `prepareSubmission`: it names the submission from
    // the same `proposed` / `regionHint` data that hook has just validated.
    beforeChange: [prepareSubmission, submissionTitle],
    afterChange: [enqueueScreening],
  },
  endpoints: [reviewSubmission],
  fields: [
    {
      // Status banner + screening verdict. Mounted on the data it renders
      // rather than on a `ui` field, so the component reads its own value
      // instead of reaching across form state (as `notificationLog` →
      // NotificationLogTable does on Events). First field ⇒ renders on top.
      name: 'screeningResult',
      type: 'json',
      // The banner IS this submission's status, so the field is labelled for
      // what a reviewer reads rather than for the column it happens to store.
      label: 'Status',
      access: systemFieldAccess,
      admin: {
        readOnly: true,
        components: { Field: '@/components/admin/EventSubmissions/EventSubmissionStatus' },
      },
    },
    {
      // Who sent this in, as they typed it. Read-only: the reviewer is judging
      // a proposal, not correcting the submitter's details.
      name: 'submitterInfo',
      type: 'json',
      label: 'Submitted By',
      admin: {
        readOnly: true,
        components: { Field: '@/components/admin/EventSubmissions/EventSubmissionSubmitter' },
      },
    },
    {
      // The whole review: what would change, field by field. Virtual — it is a
      // projection of `proposed` over a target event that can move underneath
      // the submission.
      name: 'proposedChanges',
      type: 'json',
      virtual: true,
      label: 'Proposed Changes',
      admin: {
        readOnly: true,
        components: { Field: '@/components/admin/EventSubmissions/EventSubmissionChanges' },
      },
      hooks: { afterRead: [computeProposedChanges] },
    },
    {
      // The merged event, carried into the live-preview iframe via form state —
      // which is the whole of its job, so it renders as nothing at all.
      // `admin.hidden` puts it in the form without putting it on the page (a
      // `HiddenField`), so the value still reaches the iframe.
      name: 'previewEvent',
      type: 'json',
      virtual: true,
      admin: {
        readOnly: true,
        hidden: true,
      },
      hooks: { afterRead: [computePreviewEvent] },
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
        readOnly: true,
        // Hidden when empty. A read-only relationship with nothing in it says
        // only "no event", which is already the whole message of the two
        // fields below being shown instead — they and this are complementary,
        // so the page always offers exactly one of the two.
        condition: (data) => Boolean(data?.event),
        description:
          'The event this submission proposes changes to. After acceptance it links the created event.',
      },
    },
    {
      // Optional adoption, in the same act as accepting: a created event with a
      // manager is verified on the spot (see `newEventDefaults`), and without
      // one it goes on the map marked unverified until somebody takes it on.
      //
      // New events only — an update proposal's target already has whatever
      // manager it has, and reassigning it is the Event's own business.
      name: 'manager',
      type: 'relationship',
      relationTo: 'managers',
      access: systemFieldAccess,
      admin: {
        condition: (data) => !data?.event,
        description:
          'Optional. The manager who will look after this event. Assign one to publish it as verified; leave blank and it goes on the map as unverified until a manager takes it on.',
      },
    },
    {
      // Screening resolves it, but it can come back empty (an address that
      // matched no city), and Accept refuses a new-event submission without
      // one — so the fix has to be reachable here.
      //
      // New events only, for the same reason as `manager`: an existing event
      // already has its own region, and this column never applies to it.
      //
      // No `filterOptions`, deliberately: Payload validates it on save with a
      // find that forwards the caller's `req`, and a client `req` trips the
      // select-required client-query gate — every public create would 400.
      name: 'region',
      type: 'relationship',
      relationTo: 'regions',
      access: systemFieldAccess,
      admin: {
        condition: (data) => !data?.event,
        description:
          'The city or venue this event belongs to. Resolved by screening — correct it here if it came back empty or wrong.',
      },
    },
    {
      label: 'System',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          // What this submission is about, stamped on create by `submissionTitle`:
          // "New Event: <the title the event would be created with>" or
          // "Update Event: <the target's title>". `useAsTitle`, so it names the
          // row, the breadcrumb and the browser tab.
          //
          // Not client-writable: it is derived, and a submitter naming their own
          // submission would put unreviewed text in the admin's list view.
          name: 'title',
          type: 'text',
          access: systemFieldAccess,
          admin: {
            readOnly: true,
            description: 'Generated from the proposal when the submission arrives.',
          },
        },
        {
          // The raw patch behind the diff above. Kept visible (read-only) so a
          // reviewer triaging an odd diff can see exactly what was submitted.
          name: 'proposed',
          type: 'json',
          admin: {
            readOnly: true,
            description: 'The proposed Events field patch, exactly as submitted.',
          },
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'screening',
          options: SUBMISSION_STATUSES.map((value) => ({ label: STATUS_LABELS[value], value })),
          enumName: 'enum_event_submissions_status',
          access: systemFieldAccess,
          admin: { readOnly: true },
        },
        {
          // The registrant row upserted from `submitterInfo` — abuse tracking
          // and (later) submitter notifications. Grants nothing.
          //
          // A real relationship, not a key inside `submitterInfo`: it is the
          // link `upsertUserByEmail` writes, and a Users join can only target a
          // relationship column (cf. `Users.submittedEvents` on `events.submitter`).
          name: 'submitter',
          type: 'relationship',
          relationTo: 'users',
          access: systemFieldAccess,
          admin: { readOnly: true },
        },
        {
          // Where the submitter said the event belongs, before screening
          // resolved it: `{ country, state, anchorRegion }`. Inputs to
          // `resolveSubmissionRegion`, kept for triage afterwards.
          name: 'regionHint',
          type: 'json',
          admin: {
            readOnly: true,
            description: 'Region targeting as submitted (country / state / anchor).',
          },
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
    },
  ],
}
