'use client'

import type { WorkflowButton, WorkflowButtonsProps } from './stages'

import {
  FormSubmit,
  PublishButton,
  SaveButton,
  SaveDraftButton,
  useDocumentInfo,
  useForm,
  useFormFields,
  useFormModified,
  useOperation,
  useTranslation,
} from '@payloadcms/ui'
import React, { useCallback } from 'react'

import { resolveStage } from './stages'

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
const WorkflowButtons: React.FC<WorkflowButtonsProps> = ({
  fallback,
  onlyWhen,
  stages,
  statusField,
}) => {
  const { uploadStatus } = useDocumentInfo()
  const operation = useOperation()
  const { submit } = useForm()
  const { i18n } = useTranslation()
  const modified = useFormModified()
  const status = useFormFields(([fields]) =>
    statusField ? fields?.[statusField]?.value : undefined,
  )
  // Its own subscription, not a tuple selector beside the status: a selector
  // returning an object hands back a fresh reference on every form-state change
  // and re-renders the button row on every keystroke.
  const gate = useFormFields(([fields]) => (onlyWhen ? fields?.[onlyWhen.field]?.value : undefined))

  const run = useCallback(
    (action: WorkflowButton) => {
      if (action.confirm && !window.confirm(action.confirm)) return
      void submit({ overrides: action.overrides, skipValidation: action.skipValidation })
    },
    [submit],
  )

  // A gated-out document names no stage, which is the same answer as a status
  // the declaration never mentioned — so it takes the fallback path already
  // below. ⚠ That is also what puts it ahead of a stage declared `[]`, which
  // renders nothing: a gated-out row would otherwise lose its Save button.
  const stage =
    onlyWhen && gate !== onlyWhen.equals
      ? undefined
      : resolveStage({ operation, status, statusField })
  const actions = stage === undefined ? undefined : stages[stage]

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
