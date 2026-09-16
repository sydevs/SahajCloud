import type { Plugin } from 'payload'

import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'


import { formFields } from '@/collections/Forms/fields'
import { validateFormAction } from '@/collections/Forms/hooks/validateFormAction'
import { reviewSubmission } from '@/collections/UserSubmissions/endpoints/review'
import { userSubmissionFields } from '@/collections/UserSubmissions/fields'
import { enqueueSubmissionScreening } from '@/collections/UserSubmissions/hooks/enqueueSubmissionScreening'
import { prepareUserSubmission } from '@/collections/UserSubmissions/hooks/prepareUserSubmission'
import { spawnSubscribeFromRegistration } from '@/collections/UserSubmissions/hooks/spawnSubscribeFromRegistration'
import { validateProposal } from '@/collections/UserSubmissions/hooks/validateProposal'
import { CONTACT_EMAIL } from '@/lib/contact'
import { serverEnv } from '@/lib/env/server'
import { livePreviewUrl } from '@/lib/livePreview/url'

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
 *   manager scope and `RESTRICTED_COLLECTIONS` alike.
 * - **`update: () => false`** — nothing could ever update a submission.
 *   Clearing it hands `update` to the roles that hold it, which is a real
 *   behaviour change from `form-submissions` and the reason `type`,
 *   `status` and the rest carry field-level access.
 *
 * ⚠ **The review endpoint is registered here, not in `formSubmissionOverrides`.**
 * `user-submissions` is plugin-generated, so there is no `CollectionConfig`
 * file to hang `endpoints` on, and this wrapper is the one merge whose
 * behaviour this repo owns. It is deliberately absent from
 * `CUSTOM_ENDPOINT_PATHS` — that opt-in is the only thing that would publish a
 * manager-only action in the OpenAPI spec.
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
              afterChange: [spawnSubscribeFromRegistration, enqueueSubmissionScreening],
            },
            endpoints: [...(collection.endpoints || []), reviewSubmission],
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
        defaultColumns: ['subject', 'type', 'status', 'senderEmail', 'createdAt'],
        components: {
          edit: {
            // Accept / Reject replace Save on a `proposal` row. The component
            // renders the ordinary Save for every other type — this slot is
            // collection-wide and only one intake has a review path.
            SaveButton: '@/components/admin/SubmissionReview/SubmissionActions',
          },
        },
        // Live Preview renders the event **as an accepted proposal would leave
        // it**. The widget cannot fetch the row back — a new-event proposal has
        // no Event id, and API clients hold create-only here — so Payload's own
        // postMessage carries the merged event in `previewEvent` instead.
        //
        // ⚠ The one preview that keeps a dedicated route, for that reason.
        // `path: null` on anything but an unaccepted proposal, so the other
        // three intakes get no preview panel rather than a broken one.
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
            }),
          breakpoints: [{ label: 'Mobile', name: 'mobile', width: 390, height: 844 }],
          // A reviewer is here to judge how a listing would look, so the panel
          // is open on arrival. Payload's own option: it applies only until the
          // reviewer toggles the panel themselves, after which their stored
          // preference wins — which a mount effect could not do.
          openByDefault: true,
        },
      },
      fields: userSubmissionFields,
      // Order matters: the reach check refuses a forbidden target before
      // `prepareUserSubmission` upserts a `users` row for its sender.
      //
      // `validateProposal` is `event-submissions`' own gate, reused. `proposed`
      // is a patch of real Events fields, so an ungated public POST stores what
      // Phase 3's accept path would later apply to an Event with a manager's
      // authority behind it — a submitter who could set `verificationStage` or
      // `registrationNotificationEmail` would be minting a verified listing, or
      // redirecting registrants' answers to an inbox of their choosing. The
      // gate derives its allowlist from the live Events config, so there is
      // nothing here to keep in step. It moves to a shared home in Phase 3,
      // when `event-submissions` is deleted; duplicating it now would give the
      // rule two definitions to reconcile at that merge.
      hooks: {
        beforeValidate: [validateProposal, prepareUserSubmission],
      },
    },
  })(config)
