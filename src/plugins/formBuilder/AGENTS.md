# Form Builder (`@payloadcms/plugin-form-builder`)

Configured in **`src/plugins/formBuilder`**, once — `payload.config.ts` and
the test harness both call `formsPlugin()`, since a plugin configured in only
one of the two behaves differently under test than in production.

It generates `forms` (admin group: Content) and, renamed via
`formSubmissionOverrides.slug`, **`user-submissions`** (admin group: System) —
the one intake for every public write, typed by a `type` discriminator
(`contact` / `subscribe` / `registration` / `proposal`). See
`src/collections/UserSubmissions/`.

Five things this repo does that the plugin options cannot:

- **Clears the plugin's `access` block on `user-submissions`.** `accessPlugin`
  composes `{ ...rbac, ...collection.access }`, so a collection's own access
  wins — and the plugin always supplies `read: ({ req: { user } }) => !!user`,
  which grants read to any authenticated user, every API client included. Left
  in place it outranks the role table and `RESTRICTED_COLLECTIONS` alike.
  `forms` keeps its plugin access (`read: () => true`), which is the intended
  rule: a public site renders a form anonymously.
- **Removes the plugin's `sendEmail` afterChange hook.** `formOverrides.fields`
  already strips the `emails` field, so nothing can be authored and the hook has
  provably nothing to send — but it still loads `data.form` and spreads
  `data.submissionData` on every create, and both are optional here, so it threw
  and logged once per registration. Stripping the field alone does not disable
  it; `formsPlugin` states the full mechanism, and is the one place that does.
- **Makes the `form` relationship per-type.** The plugin marks it
  unconditionally `required`; `contact` and `subscribe` need one, and the two
  types that name an `event` must not have one. The plugin's own existence check
  is composed with, not replaced.
- **Localizes the three plugin defaults that hold per-language text** (#981):
  `forms.title`, `forms.redirect.url`, and the `select` block's `placeholder`.
  All three ship storing one value for all 19 locales, so an admin editing one
  in French replaced the English everyone else reads. `formFields`
  (`src/collections/Forms/fields.ts`) maps `defaultFields` rather than using
  the plugin's `fields: { select: … }` option, which merges arrays by source —
  reaching `placeholder` through it means re-supplying the block's whole field
  list, label thunks included. ⚠ **`title` and `redirect.url` lose `required` in
  the same pass**, for the reason #977 records for `lessons.title`
  (`src/collections/Lessons/AGENTS.md`): a required localized field is validated
  against that locale's own value, so leaving the flag on refuses every save in
  a second locale.
- **Registers the proposal review surface.** The `WorkflowButtons`
  declaration, `applyReviewDecision` and the live-preview panel all hang off the
  wrapper rather than `formSubmissionOverrides`, because a plugin-generated
  collection has no `CollectionConfig` file to hang them on and this wrapper is
  the one merge this repo owns. ⚠ The review hook has to be in the wrapper's own
  `afterChange` array, which **replaces** whatever `formSubmissionOverrides`
  declared — a review hook listed there would never run, leaving buttons that
  move a status and apply nothing.

**Review is a status move, not an action endpoint** (#909). `WorkflowButtons`
submits `{ status: 'accepted' }` through Payload's own document form;
`guardStatusTransition` (a `beforeChange`) refuses a move no reviewer may make,
and `applyReviewDecision` (an `afterChange`) writes the event an accept
approves. Both read one answer, `reviewMove` in
`UserSubmissions/lifecycle/review.ts`. `POST /api/user-submissions/:id/review`
is gone, and with it the hand-rolled locale on the call.

⚠ **A reviewer is a manager holding the `user-submissions: update` grant, not
whoever a row's `manager` field names.** The collection's own `update` admits
the second through the document-manager fallback, which would make being
assigned a proposal authority to publish the event accepting it writes — see
`docs/rules/access.md`. Nothing else binds, so screening and delivery, which
carry no manager, pass untouched.

⚠ **Every collection-wide admin slot here serves four intakes.** The review
buttons gate on `type === 'proposal'` through `WorkflowButtons`' `onlyWhen` and
fall through to the ordinary Save otherwise; `livePreview.url` sends the other
three to the explanation page, with a reason that fits a row nobody reviews. A
new slot owes the same branch — the field hooks behind one included, since
`admin.condition` hides a field without stopping its hooks. The hooks above owe
it too, which is why both check `type` for themselves.

And an option that takes a **value** rather than a function cannot branch at
all, so it has to suit the three rather than the one: `openByDefault` is absent
for that reason, not by oversight. A **field** branches where an option cannot —
`proposalPreviewTargetField` is a conditioned `previewTargetField` that opens
the panel for `proposal` alone. That works because a false `admin.condition`
returns before Payload attaches the custom component to form state, so the
component never mounts. Reach for it whenever a collection-wide value would
have to suit the wrong intake.
