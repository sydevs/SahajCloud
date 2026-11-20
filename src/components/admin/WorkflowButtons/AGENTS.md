# `WorkflowButtons` — stage-dependent document buttons as data

`src/components/admin/WorkflowButtons/` replaces a bespoke button component per staged collection. A collection declares its buttons through `clientProps` on an edit-view slot:

```ts
admin.components.edit.SaveButton = {
  path: WORKFLOW_BUTTONS,
  clientProps: {
    statusField: 'status', // the form field whose value picks the stage
    fallback: null, // 'publish' | 'save' | 'saveDraft' | null
    rules: [
      // Precedence order. `when` is optional; omitted, the rule applies to every document.
      { when: { userType: 'admin' }, stages: SPAM_STAGES },
      { when: { field: 'type', equals: 'proposal' }, stages: REVIEW_STAGES },
    ],
  } satisfies WorkflowButtonsProps<MyStage>,
}
```

Each action is `{ label, overrides, confirm?, buttonStyle?, skipValidation? }`; `overrides` is merged into the submit, so `{ status: 'committing' }` is how a button makes a transition and `{}` is a plain save. Six rules:

- **`clientProps`, not `admin.custom`.** An edit-view slot is not a field, so there is no `field.admin.custom` to read, and `createClientCollectionConfig` strips a collection's top-level `custom`. `renderDocumentSlots` passes a `RawPayloadComponent`'s own `clientProps` through — which is why each declaration is an object rather than a path string.
- **An empty stage array is not a missing one.** `[]` renders nothing; a stage the declaration never names falls through to `fallback`. Collapsing the two put Publish back on Meditations' create screen.
- **An unsaved document is `CREATE_STAGE`, whatever the status field holds.** A collection that defaults `status` to a running stage would otherwise hand the create form that stage's buttons.
- **The contract lives in `stages.ts`, not beside the component.** Every export of a `'use client'` module reaches a server module as a client reference, so a config reading `CREATE_STAGE` off the component would key its map on an object. Same split as `UserSubmissions/statuses.ts`.
- **A slot serving several kinds of document decides over (kind, viewer, stage), so it declares an ordered `rules` list.** The first rule that both applies and names the document's stage wins; a rule that applies but is silent about the stage falls through to the next, so an earlier rule narrows rather than claims. `user-submissions` holds four intakes sharing one status vocabulary, so a `contact` row at `pending` resolves the same stage as a proposal awaiting review — and ungated would be offered Accept and Reject. A stage no applying rule names reaches `fallback`; a stage declared `[]` **is** named, so it wins and renders nothing, which is what keeps "no action here" from reading as "not my kind of document" and restoring the Save button.
- **A rule offering a privileged move must name the viewer.** `when.userType: 'admin'` is read from `useAuth()`, and it exists because a button the server will refuse is a control that can only answer 403 (`docs/rules/access.md`). Settling a spam refusal is an admin's move on every intake (`SUBMISSION_MACHINE`), and `managerSubmissionScope` does admit a region manager to a refused contact row addressed to them — so that rule is gated on both sides of the wire. `user-submissions-review-lifecycle.int.spec.ts` asserts the coupling by judging every ungated rule's buttons against the machine as a non-admin reviewer who holds the grant.

**A button is an offer, never a permission, so the server owes its own guard.** `admin.readOnly` on a status column is the admin UI alone, and a field access rule that admits managers admits every manager's `PATCH`. `user-submissions` pairs its declaration with `SUBMISSION_MACHINE`, whose guard rides on the `status` column (which moves a reviewer may make) and whose matched move's name `applyReviewDecision` acts on (what each one then does) — see `src/plugins/formBuilder/AGENTS.md`. Build each rule's `stages` map from whatever the server's own rule reads, rather than listing the statuses again: a hand-written map can offer a button the guard then refuses. `stagesFor(statuses, buttons)` in `stages.ts` is that spread — `{ ...stagesFor(OPEN_REVIEW_STATUSES, REVIEW_BUTTONS), accepted: [] }` — and `when` is how the same discipline reaches the half a status set cannot express, the viewer.

**That guard is the state machine's, and the column carries it** (#1121). A lifecycle is declared
once with `defineStateMachine` (`src/lib/stateMachine/machine.ts`), and the column is
`stateMachineField(machine, …)` (`src/fields/stateMachineField.ts`), which mounts the guard after
every collection hook. The domain facts — who reviews, which intake has a review path, the region
an accept needs — are rows and conditions in the owner's own table, never a second predicate beside
it. Meditations' buttons post `{ _status: 'draft' }` — Payload's own gate — so they need neither.
