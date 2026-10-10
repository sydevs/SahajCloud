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

/** Where the component is declared from, so a move cannot orphan a declaration. */
export const WORKFLOW_ACTIONS = '@/components/admin/buttons/WorkflowActions'

/** The stage an unsaved document is at, whatever `statusField` already holds. */
export const CREATE_STAGE = '__create__'

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

/**
 * `TStage` is the collection's own stage vocabulary, so a declaration names it
 * and a typo is a type error rather than a stage that silently renders the
 * fallback — `satisfies WorkflowActionsProps<ImportStatus | typeof CREATE_STAGE>`.
 */
export interface WorkflowActionsProps<TStage extends string = string> {
  /** Form field whose value picks the stage; omit to key on the create alone. */
  statusField?: string
  /** Buttons per stage. An empty array is a stage with no action, not a missing one. */
  stages: Partial<Record<TStage, WorkflowAction[]>>
  /** What a stage with no entry renders: Payload's own button, or nothing. */
  fallback: 'publish' | 'save' | 'saveDraft' | null
}

/**
 * Which stage a document is at, from the operation and the status field's value.
 *
 * ⚠ **An unsaved document is `CREATE_STAGE` whatever the status field holds.**
 * `event-imports` defaults `status` to `resolving`, which is the stage the
 * resolve *job* owns — so keying on the value alone would offer the create form
 * the buttons of a batch already being geocoded.
 *
 * `undefined` means no stage could be named, which is not the same as a stage
 * with no buttons: the caller renders its fallback for the first and nothing for
 * the second. A saved document with no `statusField` lands there, which is how
 * Meditations reaches Payload's own buttons on every screen but the create.
 */
export function resolveStage({
  operation,
  status,
  statusField,
}: {
  operation: 'create' | 'update' | undefined
  status: unknown
  statusField: string | undefined
}): string | undefined {
  if (operation !== 'update') return CREATE_STAGE
  if (!statusField) return undefined
  return typeof status === 'string' ? status : undefined
}
