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
- **Registers the proposal review surface.** `POST /api/user-submissions/:id/review`,
  the Accept/Reject `SaveButton`, and the live-preview panel all hang off the
  wrapper rather than `formSubmissionOverrides`, because a plugin-generated
  collection has no `CollectionConfig` file to hang `endpoints` on and this
  wrapper is the one merge this repo owns. The endpoint is deliberately absent
  from `CUSTOM_ENDPOINT_PATHS` — that opt-in is the only thing that would
  publish a manager-only action in the OpenAPI spec.

⚠ **Every collection-wide admin slot here serves four intakes.** The review
components gate on `type === 'proposal'` themselves and fall through to the
ordinary Save otherwise; `livePreview.url` sends the other three to the
explanation page, with a reason that fits a row nobody reviews. A new slot owes
the same branch — the field hooks behind one included, since `admin.condition`
hides a field without stopping its hooks.

And an option that takes a **value** rather than a function cannot branch at
all, so it has to suit the three rather than the one: `openByDefault` is absent
for that reason, not by oversight. A **field** branches where an option cannot —
`proposalPreviewTargetField` is a conditioned `previewTargetField` that opens
the panel for `proposal` alone. That works because a false `admin.condition`
returns before Payload attaches the custom component to form state, so the
component never mounts. Reach for it whenever a collection-wide value would
have to suit the wrong intake.
