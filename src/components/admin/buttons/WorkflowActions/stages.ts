/**
 * `WorkflowActions`' contract, in a leaf both sides may import.
 *
 * ⚠ **A collection config must not import these from the component.** Every
 * export of a `'use client'` module reaches a server module as a client
 * reference rather than its value, so a config reading `CREATE_STAGE` from
 * `WorkflowActions.tsx` would key its `stages` map on an object. The component
 * imports this file; the configs that declare it do too — the same shape as
 * `UserSubmissions/statuses.ts`, which `SubmissionActions` and the review
 * operation share.
 */

/**
 * Where the component is declared from, spelled once. Payload reads this value
 * when it builds the import map, so a constant resolves exactly as the literal
 * did — and a move cannot leave one of the three declarations behind.
 */
export const WORKFLOW_ACTIONS = '@/components/admin/buttons/WorkflowActions'

/** The stage an unsaved document is at, whatever `statusField` already holds. */
export const CREATE_STAGE = '__create__'

/** The stage a saved document is at when no `statusField` names a finer one. */
export const UPDATE_STAGE = '__update__'

export interface WorkflowAction {
  /** What the button reads. */
  label: string
  /** Merged into the submit — `{ status: 'committing' }`, `{ _status: 'draft' }`. */
  overrides: Record<string, unknown>
  /** Asked before the submit; a dismissal cancels it. */
  confirm?: string
  buttonStyle?: 'primary' | 'secondary'
  skipValidation?: boolean
}

export interface WorkflowActionsProps {
  /** Form field whose value picks the stage; omit to key on create/update only. */
  statusField?: string
  /** Buttons per stage. An empty array is a stage with no action, not a missing one. */
  stages: Record<string, WorkflowAction[]>
  /** What a stage with no entry renders: Payload's own button, or nothing. */
  fallback: 'publish' | 'save' | 'saveDraft' | null
}

/**
 * Which stage a document is at, from its id and the status field's value.
 *
 * ⚠ **An unsaved document is `CREATE_STAGE` whatever the status field holds.**
 * `event-imports` defaults `status` to `resolving`, which is the stage the
 * resolve *job* owns — so keying on the value alone would offer the create form
 * the buttons of a batch already being geocoded.
 *
 * `undefined` means no stage could be named, which is not the same as a stage
 * with no buttons: the caller renders its fallback for the first and nothing for
 * the second.
 */
export function resolveStage({
  id,
  status,
  statusField,
}: {
  id: number | string | undefined
  status: unknown
  statusField: string | undefined
}): string | undefined {
  if (!id) return CREATE_STAGE
  if (!statusField) return UPDATE_STAGE
  return typeof status === 'string' ? status : undefined
}
