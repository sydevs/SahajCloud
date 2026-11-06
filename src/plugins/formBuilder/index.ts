import type { Plugin } from 'payload'

import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'

import { formFields } from '@/collections/Forms/fields'
import { validateFormAction } from '@/collections/Forms/hooks/validateFormAction'
import { userSubmissionFields } from '@/collections/UserSubmissions/fields'
import { applyReviewDecision } from '@/collections/UserSubmissions/hooks/applyReviewDecision'
import {
  gateEventFeedback,
  syncCommunityFeedback,
} from '@/collections/UserSubmissions/hooks/eventFeedback'
import { gateRegistration } from '@/collections/UserSubmissions/hooks/gateRegistration'
import { guardStatusTransition } from '@/collections/UserSubmissions/hooks/guardStatusTransition'
import { prepareUserSubmission } from '@/collections/UserSubmissions/hooks/prepareUserSubmission'
import { queueScreening } from '@/collections/UserSubmissions/hooks/queueScreening'
import { resolveProposalRegion } from '@/collections/UserSubmissions/hooks/resolveProposalRegion'
import { spawnSubscribeFromRegistration } from '@/collections/UserSubmissions/hooks/spawnSubscribeFromRegistration'
import {
  syncFullnessAfterChange,
  syncFullnessAfterDelete,
} from '@/collections/UserSubmissions/hooks/syncFullness'
import { validateProposal } from '@/collections/UserSubmissions/hooks/validateProposal'
import { orphanedUserHooks } from '@/collections/UserSubmissions/orphanedUsers'
import type { SpamReviewStatus } from '@/collections/UserSubmissions/statuses'
import {
  OPEN_REVIEW_STATUSES,
  REOPENABLE_REVIEW_STATUSES,
} from '@/collections/UserSubmissions/statuses'
import type {
  WorkflowButton,
  WorkflowButtonsProps,
  WorkflowRule,
} from '@/components/admin/WorkflowButtons/stages'
import { stagesFor, WORKFLOW_BUTTONS } from '@/components/admin/WorkflowButtons/stages'
import { CONTACT_EMAIL } from '@/lib/contact'
import { serverEnv } from '@/lib/env/server'
import { livePreviewUrl } from '@/lib/livePreview/url'
import type { UserSubmission } from '@/payload-types'
import type { PurgeWindow, RetentionConfig } from '@/types/retention'

/**
 * How long a **delivered contact message** is kept. Short on purpose: the row
 * persists only so screening has history to compare against.
 *
 * ⚠ **Lower bound**: must stay comfortably above `HISTORY_WINDOW_HOURS`, or
 * sender history counts against deleted rows and silently passes everything.
 * `tests/unit/submission-retention.spec.ts` pins it.
 */
export const CONTACT_ACCEPTED_DAYS = 7

/**
 * How long a **machine-refused** (`spam`, or `confirmed_spam` once an admin
 * agrees) row is kept, whatever its type.
 * Longer, because a sender's history is the evidence a pattern is visible in.
 * Bounded, because abuse tracking has a shelf life.
 */
export const MACHINE_SPAM_DAYS = 90

/**
 * How long a proposal is kept once a manager has decided it, either way.
 *
 * ⚠ **An undecided proposal is in no window**, so one nobody reviews keeps its
 * sender's address and phone number until somebody decides. Delivery leaves a
 * proposal `pending` for exactly that reviewer
 * (`DeliverSubmissions/deliverers.ts`); before #909 it settled as `accepted`
 * the moment the review email sent, and this window swept it under a label no
 * manager had chosen.
 */
export const PROPOSAL_DAYS = 30

/**
 * The sweeps, in the order they run. **Machine-spam first**, which makes the
 * windows disjoint by construction rather than by reading two `status` clauses
 * together.
 *
 * ⚠ **A machine refusal is `spam` and a manager's decline is `rejected`**, so
 * each reaches exactly one window. That separation is what lets a declined
 * proposal go at 30 days with the rest of its type, rather than waiting out the
 * spam window because nothing cheap could tell the two refusals apart.
 *
 * ⚠ **`failed` is deliberately in no window**: it means we accepted a
 * submission, told nobody, and delivered nothing. It stays until a manager
 * resolves it.
 */
export const PURGE_WINDOWS: PurgeWindow[] = [
  {
    days: MACHINE_SPAM_DAYS,
    name: 'machineSpam',
    // ⚠ The one window that names no type, and the only one that may. A
    // registration is an attendance record and a subscribe row is a consent
    // record, kept for ever — but a `spam` one of either is neither, because
    // nobody came and nobody subscribed. It is evidence like any other
    // refusal, and ages out with the rest. `confirmed_spam` is an admin
    // agreeing with that refusal, so it ages out on the same clock.
    where: (cutoff) => ({
      status: { in: ['spam', 'confirmed_spam'] },
      createdAt: { less_than: cutoff },
    }),
  },
  {
    days: CONTACT_ACCEPTED_DAYS,
    name: 'contactAccepted',
    where: (cutoff) => ({
      type: { equals: 'contact' },
      status: { equals: 'accepted' },
      createdAt: { less_than: cutoff },
    }),
  },
  {
    days: PROPOSAL_DAYS,
    name: 'proposals',
    where: (cutoff) => ({
      type: { equals: 'proposal' },
      status: { in: ['accepted', 'rejected'] },
      createdAt: { less_than: cutoff },
    }),
  },
]

/**
 * ⚠ **The users sweep is the half that makes retention mean anything**, and it
 * is why a collection's retention may carry hooks at all. A contact row's
 * retention promise is about the person who sent it, and every submission
 * upserts its sender into `users` — so deleting the message while keeping the
 * address would leave the personal data behind and the promise unkept.
 *
 * ⚠ **So the task reports a collection that declares no retention of its own.**
 * `users` is swept from here: an orphan ages nothing, going when its last
 * referencing submission goes, and retention windows are all the sweep reads.
 */
const USER_SUBMISSIONS_RETENTION: RetentionConfig = {
  hooks: orphanedUserHooks,
  windows: PURGE_WINDOWS,
}

const REVIEW_BUTTONS: WorkflowButton[] = [
  {
    label: 'Reject',
    overrides: { status: 'rejected' },
    buttonStyle: 'secondary',
    confirm: 'Reject this submission?',
  },
  { label: 'Accept', overrides: { status: 'accepted' } },
]

const REOPEN_BUTTONS: WorkflowButton[] = [{ label: 'Reopen', overrides: { status: 'pending' } }]

const NOT_SPAM: WorkflowButton = {
  label: 'Not spam',
  overrides: { status: 'pending' },
  buttonStyle: 'secondary',
}

/**
 * What an admin may do with a row the spam check refused, on every intake.
 *
 * Keyed on `SpamReviewStatus` rather than the whole vocabulary, so a third
 * spam status is a compile error here instead of one nobody can settle. The two
 * members are offered different decisions: there is nothing left to confirm
 * once an admin has.
 */
const SPAM_STAGES: Record<SpamReviewStatus, WorkflowButton[]> = {
  spam: [
    NOT_SPAM,
    {
      label: 'Confirm spam',
      overrides: { status: 'confirmed_spam' },
      confirm: 'Confirm this as spam?',
    },
  ],
  confirmed_spam: [NOT_SPAM],
}

/**
 * Which buttons a reviewer is offered at which status.
 *
 * ⚠ **Built from the two status sets, never from a list of its own.** The
 * server decides the same thing from `OPEN_REVIEW_STATUSES` and
 * `REOPENABLE_REVIEW_STATUSES` (`reviewMove`), so a hand-written map here could
 * offer a button whose transition the guard then refuses, or leave a newly-open
 * status with no button at all. `SubmissionActions` imported both sets for
 * exactly this reason before the move to data.
 *
 * The two spam statuses are in `REOPENABLE_REVIEW_STATUSES` too, so they get a
 * Reopen here. An admin sees `SPAM_STAGES` on such a row instead, since that
 * rule comes first; a region manager reviewing a refused **proposal** sees this
 * Reopen, which is the move `reviewMove` grants them — the admin-only gate
 * covers settling a refusal, not re-opening a proposal.
 */
const REVIEW_STAGES: WorkflowRule<UserSubmission['status']>['stages'] = {
  ...stagesFor(OPEN_REVIEW_STATUSES, REVIEW_BUTTONS),
  ...stagesFor(REOPENABLE_REVIEW_STATUSES, REOPEN_BUTTONS),
  // A stage with no action, not a missing one: Payload's own ⋯ menu carries this
  // row's Delete, for whoever holds the grant.
  accepted: [],
}

/**
 * The form-builder plugin, configured once, plus the two things its options
 * cannot express: clearing the plugin's `access` block and dropping its
 * `sendEmail` hook. Both are stated here and nowhere else.
 *
 * **One definition, shared with the test harness**, which builds its own
 * Payload config (`tests/utils/testHelpers.ts`) — a plugin configured in only
 * one of the two behaves differently under test than in production, which is
 * the trap `REGION_NESTED_DOCS_CONFIG` exists to avoid for nested-docs.
 *
 * ⚠ Register it **before** `accessPlugin`, which must be last so it sees the
 * collections this creates.
 *
 * ⚠ **The plugin's own `access` block is cleared below, and without that every
 * access rule this repo writes for `user-submissions` is decorative.**
 *
 * `accessPlugin` composes `{ ...createAccessConfig(slug, …), ...collection.access }`
 * — a collection's own `access` wins, by design, so a hand-written override is
 * never clobbered. The form-builder plugin always supplies one, and it is not
 * an override anybody chose here. All three of its entries matter:
 *
 * - **`create: () => true`** — an *anonymous*, unauthenticated create. The
 *   write guard only inspects writes by an authenticated client, so this is
 *   also a captcha-free one. This is the entry that most needs clearing.
 * - **`read: ({ req: { user } }) => !!user`** — read for any authenticated
 *   user, every API client included, on a table of unscreened stranger
 *   messages and registrant addresses. It outranks the role table, the per-row
 *   manager scope and project-membership read alike.
 * - **`update: () => false`** — nothing could ever update a submission.
 *   Clearing it hands `update` to the roles that hold it, which is a real
 *   behaviour change from `form-submissions` and the reason `type`,
 *   `status` and the rest carry field-level access.
 *
 * `access: {}` hands the collection back to RBAC.
 * `tests/int/user-submissions-access.int.spec.ts` reads rows back through
 * `overrideAccess: false` rather than asserting the grants, which is what
 * catches this.
 *
 * `forms` keeps its plugin `access` (`read: () => true`): a public site renders
 * a form anonymously, so that one IS the intended rule.
 *
 * ⚠ Both the clear and the hook removal key on the literal slug
 * `user-submissions`. Renaming the collection without changing them silently
 * restores the anonymous create above.
 *
 * ⚠ **`applyReviewDecision` is listed in the `afterChange` array below, not in
 * `formSubmissionOverrides`.** The replacement below discards whatever that
 * array held, so a review hook declared there would never run — and the review
 * surface would be buttons that moved a status and applied nothing.
 *
 * ⚠ The plugin's `sendEmail` afterChange hook is removed below — as
 * `afterChange: []`, which discards the whole array — and stripping `emails` is
 * not enough on its own. `sendEmail` is the only afterChange the plugin
 * registers and this repo adds none, so nothing else is lost today; a future
 * `formSubmissionOverrides.hooks.afterChange` would be, so add it here rather
 * than there.
 *
 * That hook runs on **every** create, ahead of anything this repo registers,
 * and its first act is to load `data.form` and spread `data.submissionData`.
 * Both are optional here — a registration or proposal names an event and no
 * form — so on two of the four types it throws, is caught by its own handler,
 * and logs `Error while sending one or more emails` once per submission. It
 * would also cost a `forms` lookup per create for a feature that is off.
 *
 * Nothing is swallowed by removing it. `emails` does not exist on `forms`, so
 * no email can be authored, so there is provably nothing for it to send — the
 * concern behind "never suppress with `beforeEmail`" is a message somebody
 * wrote going missing, and none can be written. Delivery belongs to the queue.
 */
export const formsPlugin = (): Plugin => async (config) => {
  const withForms = await formBuilder(config)

  return {
    ...withForms,
    collections: withForms.collections?.map((collection) =>
      collection.slug === 'user-submissions'
        ? {
            ...collection,
            access: {},
            // The plugin's `sendEmail` is dropped by replacing the array, not by
            // filtering it — see the docblock above. This repo's own afterChange
            // hooks therefore have to be listed *here*, not in
            // `formSubmissionOverrides`, where this replacement would discard
            // them. Order matters: the spawned subscribe row is created inside
            // the registration's transaction, so it exists before the queue kick
            // below could ever run.
            hooks: {
              ...collection.hooks,
              afterChange: [
                spawnSubscribeFromRegistration,
                syncFullnessAfterChange,
                syncCommunityFeedback,
                queueScreening,
                applyReviewDecision,
              ],
            },
          }
        : collection,
    ),
  }
}

/**
 * The plugin's own options — everything expressible as configuration.
 *
 * **The submissions collection is renamed `user-submissions`** (#723). It is
 * the one intake for every public write — contact, subscribe, registration,
 * proposal — and not every one of those comes from an authored form, which is
 * why the plugin's own name no longer fits. See
 * `src/collections/UserSubmissions/`.
 *
 * `formOverrides.fields` strips the plugin's `emails` array. Why, and what that
 * does and does not buy, is stated once in `src/collections/Forms/fields.ts`,
 * which owns that list — it is **not** what disables `sendEmail`. `formsPlugin`
 * above removes the hook.
 */
const formBuilder = (config: Parameters<Plugin>[0]) =>
  formBuilderPlugin({
    defaultToEmail: CONTACT_EMAIL,
    formOverrides: {
      admin: { group: 'Content', enableRichTextRelationship: true },
      fields: formFields,
      hooks: { beforeValidate: [validateFormAction] },
    },
    formSubmissionOverrides: {
      slug: 'user-submissions',
      labels: { singular: 'User Submission', plural: 'User Submissions' },
      admin: {
        group: 'System',
        useAsTitle: 'subject',
        defaultColumns: ['subject', 'type', 'status', 'user', 'createdAt'],
        components: {
          edit: {
            // Beside Save rather than in it: `SaveButton` is the review buttons'
            // slot. Serves all four intakes, and hides itself on an anonymous row.
            beforeDocumentControls: [
              { path: '@/components/admin/BlockUserButton', clientProps: { source: 'submission' } },
            ],
            // No `skipValidation` on any button: the no-region refusal reaches
            // the form as a field error on `region`, which validation is what
            // delivers.
            SaveButton: {
              path: WORKFLOW_BUTTONS,
              clientProps: {
                fallback: 'save',
                rules: [
                  // First, because settling a refusal is one decision on every
                  // intake and it outranks re-opening one: a reader looking at
                  // a refused proposal is asked whether it is spam, not whether
                  // to review it. Admin-only on both sides of the wire — only
                  // an admin may make the move (`reviewMove`), so only an admin
                  // is offered it.
                  { stages: SPAM_STAGES, when: { userType: 'admin' } },
                  { stages: REVIEW_STAGES, when: { equals: 'proposal', field: 'type' } },
                ],
                statusField: 'status',
              } satisfies WorkflowButtonsProps<UserSubmission['status']>,
            },
          },
        },
        // Live Preview renders the event **as an accepted proposal would leave
        // it**. The widget cannot fetch the row back — a new-event proposal has
        // no Event id, and API clients hold create-only here — so Payload's own
        // postMessage carries the merged event in `previewEvent` instead.
        //
        // ⚠ The one preview that keeps a dedicated route, for that reason.
        //
        // ⚠ `path: null` does **not** close the panel — `livePreviewUrl` never
        // returns a falsy URL, because Payload would persist that as the
        // editor's preference for the whole collection. The other three
        // intakes land on the explanation page instead, which is why they need
        // a `reason` of their own: `no-path` tells a reader to fill in a slug.
        //
        // `openByDefault` is deliberately absent. It is collection-wide and
        // cannot branch on `type`, so opening it for the reviewer's benefit
        // would greet every contact, subscribe and registration row with that
        // explanation page. A conditioned `previewTargetField` opens the panel
        // for `proposal` alone instead, and a second closes it for the other
        // three — `proposalPreviewTargetField` and `closedPreviewTargetField` in
        // `UserSubmissions/fields.ts`.
        livePreview: {
          url: ({ data, locale }) =>
            livePreviewUrl({
              base: serverEnv.SAHAJATLAS_URL,
              path: data?.type === 'proposal' && typeof data?.id === 'number' ? 'preview' : null,
              params: {
                collection: 'user-submissions',
                id: String(data?.id ?? ''),
                locale: locale.code,
              },
              reason: 'not-reviewable',
            }),
          breakpoints: [{ label: 'Mobile', name: 'mobile', width: 390, height: 844 }],
        },
      },
      // Retention is declared beside the windows' own reasons, and read by
      // `cleanupCollections` off the built config.
      custom: { retention: USER_SUBMISSIONS_RETENTION },
      fields: userSubmissionFields,
      // Order matters: the reach check refuses a forbidden target before
      // `prepareUserSubmission` upserts a `users` row for its sender.
      //
      // `proposed` is a patch of real Events fields, so an ungated public POST
      // stores what the accept path later applies to an Event with a manager's
      // authority behind it — a submitter who could set `verificationStage` or
      // `registrationNotificationEmail` would be minting a verified listing, or
      // redirecting registrants' answers to an inbox of their choosing. The
      // gate derives its allowlist from the live Events config, so there is
      // nothing here to keep in step.
      hooks: {
        // `gateRegistration` before `prepareUserSubmission` — both are
        // `beforeValidate`, and Payload runs every one of those ahead of every
        // `beforeChange`, so a refusal has to live in this array to come first.
        // See the hook for why the ordering is about cost rather than
        // correctness.
        beforeValidate: [
          validateProposal,
          gateRegistration,
          prepareUserSubmission,
          resolveProposalRegion,
        ],
        // The vote gate is a `beforeChange`, and `afterDelete` is not one of the
        // arrays the wrapper above replaces — so both belong here. Their
        // `afterChange` siblings do not: listing them here would have the
        // wrapper's whole-array replacement discard them.
        beforeChange: [gateEventFeedback, guardStatusTransition],
        afterDelete: [syncFullnessAfterDelete],
      },
    },
  })(config)
