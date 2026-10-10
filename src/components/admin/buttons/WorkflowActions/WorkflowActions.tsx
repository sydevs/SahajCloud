'use client'

import type { WorkflowAction, WorkflowActionsProps } from './stages'

import {
  FormSubmit,
  PublishButton,
  SaveButton,
  SaveDraftButton,
  useDocumentInfo,
  useForm,
  useFormFields,
  useFormModified,
} from '@payloadcms/ui'
import React, { useCallback } from 'react'


import { resolveStage } from './stages'

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
 * and never `SaveButton`, so Meditations declares the first two and
 * `event-imports` the third.
 */
const WorkflowActions: React.FC<WorkflowActionsProps> = ({ fallback, stages, statusField }) => {
  const { id } = useDocumentInfo()
  const { submit } = useForm()
  const modified = useFormModified()
  const status = useFormFields(([fields]) =>
    statusField ? fields?.[statusField]?.value : undefined,
  )

  const run = useCallback(
    (action: WorkflowAction) => {
      if (action.confirm && !window.confirm(action.confirm)) return
      void submit({ overrides: action.overrides, skipValidation: action.skipValidation })
    },
    [submit],
  )

  const stage = resolveStage({ id, status, statusField })
  const actions = stage === undefined ? undefined : stages[stage]

  if (!actions) {
    if (!fallback) return null
    const Fallback = FALLBACKS[fallback]
    return <Fallback />
  }

  return (
    <div style={{ display: 'flex', gap: 'calc(var(--base) * 0.4)' }}>
      {actions.map((action) => (
        <FormSubmit
          buttonStyle={action.buttonStyle ?? 'primary'}
          // An action carrying no overrides submits only what the form itself
          // holds, so an unmodified document gives it nothing to post — the rule
          // Payload's own `SaveButton` applies. One carrying overrides stays
          // enabled, or Commit would be unreachable on a batch nobody edited.
          disabled={Boolean(id) && !modified && Object.keys(action.overrides).length === 0}
          key={action.label}
          onClick={() => run(action)}
          type="button"
        >
          {action.label}
        </FormSubmit>
      ))}
    </div>
  )
}

export default WorkflowActions
