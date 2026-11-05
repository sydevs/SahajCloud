'use client'

import type { WorkflowButton, WorkflowButtonsProps } from './stages'

import {
  FormSubmit,
  PublishButton,
  SaveButton,
  SaveDraftButton,
  useAuth,
  useDocumentInfo,
  useForm,
  useFormFields,
  useFormModified,
  useOperation,
  useTranslation,
} from '@payloadcms/ui'
import React, { useCallback, useMemo } from 'react'

import { resolveStage, ruleApplies } from './stages'

/**
 * ⚠ **The key must match the slot the declaration sits in.** Nothing can check
 * it: `renderDocumentSlots` tells a component nothing about which slot rendered
 * it, so `fallback: 'saveDraft'` in the `PublishButton` slot would quietly
 * render the draft button where Publish belongs.
 */
const FALLBACKS = {
  publish: PublishButton,
  save: SaveButton,
  saveDraft: SaveDraftButton,
} as const

/**
 * The document-control buttons for a collection whose saves mean different
 * things at different stages, declared as data in `clientProps` rather than
 * written as another component per collection.
 *
 * ⚠ **`clientProps`, not `admin.custom`.** An edit-view slot is not a field, so
 * there is no `field.admin.custom` to read — `renderDocumentSlots` passes a
 * `RawPayloadComponent`'s own `clientProps` through and nothing else
 * (`@payloadcms/next/dist/views/Document/renderDocumentSlots.js`). A
 * collection's top-level `custom` key would not arrive either way:
 * `createClientCollectionConfig` strips it before the client sees the config.
 *
 * Which slot a declaration belongs in is Payload's choice, not ours: that same
 * module serves a drafts-enabled collection `PublishButton` / `SaveDraftButton`
 * and never `SaveButton`, so Meditations declares the first two.
 */
const WorkflowButtons: React.FC<WorkflowButtonsProps> = ({ fallback, rules, statusField }) => {
  const { uploadStatus } = useDocumentInfo()
  const operation = useOperation()
  const { submit } = useForm()
  const { i18n } = useTranslation()
  const modified = useFormModified()
  const { user } = useAuth()
  const status = useFormFields(([fields]) =>
    statusField ? fields?.[statusField]?.value : undefined,
  )

  const gateFields = useMemo(
    () => [...new Set(rules.map((rule) => rule.when?.field).filter((f) => f !== undefined))],
    [rules],
  )
  // Its own subscription, not a tuple selector beside the status: a selector
  // returning an object hands back a fresh reference on every form-state change
  // and re-renders the button row on every keystroke. So it returns the gates
  // as JSON — one string, compared by value — and the record is rebuilt from it
  // only when one of those fields actually changes. `equals` is a scalar by
  // contract, so nothing a rule can test is lost in the round trip.
  const gateJson = useFormFields(([fields]) =>
    JSON.stringify(
      Object.fromEntries(gateFields.map((name) => [name, fields?.[name]?.value ?? null])),
    ),
  )
  const gates = useMemo(() => JSON.parse(gateJson) as Record<string, unknown>, [gateJson])
  // `ClientUser` carries no `type` — it is a field of ours, not Payload's.
  const isAdmin = (user as null | { type?: unknown })?.type === 'admin'

  const run = useCallback(
    (action: WorkflowButton) => {
      if (action.confirm && !window.confirm(action.confirm)) return
      void submit({ overrides: action.overrides, skipValidation: action.skipValidation })
    },
    [submit],
  )

  const named = resolveStage({ operation, status, statusField })
  // The first rule that both applies and names this stage. A rule that applies
  // but is silent about the stage falls through to the next, so an earlier rule
  // narrows rather than claims — and a stage no applying rule names reaches the
  // fallback below. ⚠ A stage declared `[]` is named, so it still wins and
  // renders nothing; that is what keeps "no action here" from reading as "not
  // my kind of document", which would restore the Save button.
  const actions =
    named === undefined
      ? undefined
      : rules.find(
          (rule) =>
            rule.stages[named] !== undefined &&
            ruleApplies(rule.when, { field: (name) => gates[name], isAdmin }),
        )?.stages[named]

  if (!actions) {
    if (!fallback) return null
    const Fallback = FALLBACKS[fallback]
    return <Fallback />
  }

  // A stage with no actions renders nothing at all, not an empty row: the
  // wrapper below is a flex container, and an empty one still takes its gap in
  // `.doc-controls__controls`.
  if (actions.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 'calc(var(--base) * 0.4)' }}>
      {actions.map((action) => (
        <FormSubmit
          buttonStyle={action.buttonStyle ?? 'primary'}
          // Both rules are Payload's own `SaveButton`'s, spelled as it spells
          // them. An action carrying no overrides submits only what the form
          // itself holds, so an unmodified document gives it nothing to post —
          // while one carrying overrides stays enabled, or Commit would be
          // unreachable on a batch nobody edited. And nothing submits
          // mid-upload, or the save posts without the file this collection
          // exists to carry.
          disabled={
            uploadStatus === 'uploading' ||
            (operation === 'update' && !modified && Object.keys(action.overrides).length === 0)
          }
          key={action.label}
          onClick={() => run(action)}
          type="button"
        >
          {action.labelKey && i18n.t(action.labelKey as never) !== action.labelKey
            ? i18n.t(action.labelKey as never)
            : action.label}
        </FormSubmit>
      ))}
    </div>
  )
}

export default WorkflowButtons
