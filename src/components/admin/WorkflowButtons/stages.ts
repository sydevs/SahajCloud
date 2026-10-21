/**
 * `WorkflowButtons`' contract, in a leaf both sides may import.
 *
 * ⚠ **A collection config must not import these from the component.** Every
 * export of a `'use client'` module reaches a server module as a client
 * reference rather than its value, so a config reading `CREATE_STAGE` from
 * `WorkflowButtons.tsx` would key its `stages` map on an object. The component
 * imports this file; the configs that declare it do too — the same shape as
 * `UserSubmissions/statuses.ts`, which the collection's own hooks and the
 * review lifecycle share.
 */

/** Where the component is declared from, so a move cannot orphan a declaration. */
export const WORKFLOW_BUTTONS = '@/components/admin/WorkflowButtons'

/** The stage an unsaved document is at, whatever `statusField` already holds. */
export const CREATE_STAGE = '__create__'

export interface WorkflowButton {
  /** What the button reads. */
  label: string
  /**
   * A Payload translation key read instead of `label` in the admin's own
   * language (`general:next`), with `label` the fallback should it be missing.
   */
  labelKey?: string
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
 * fallback — `satisfies WorkflowButtonsProps<ImportStatus | typeof CREATE_STAGE>`.
 */
export interface WorkflowButtonsProps<TStage extends string = string> {
  /** Form field whose value picks the stage; omit to key on the create alone. */
  statusField?: string
  /**
   * Render `fallback` unless this form field holds this value, whatever stage
   * the status names.
   *
   * For a slot whose collection holds several kinds of document sharing one
   * status vocabulary, where stage alone cannot tell them apart
   * (`docs/rules/admin-ui.md`).
   *
   * The match is `!==`, so `equals` is only what that compares by value. An
   * object or an array would be a declaration nothing can ever satisfy.
   */
  onlyWhen?: { field: string; equals: string | number | boolean | null }
  /** Buttons per stage. An empty array is a stage with no action, not a missing one. */
  stages: Partial<Record<TStage, WorkflowButton[]>>
  /** What a stage with no entry renders: Payload's own button, or nothing. */
  fallback: 'publish' | 'save' | 'saveDraft' | null
}

/**
 * `stages` entries giving every status in a set the same buttons.
 *
 * So a declaration can be built from whatever set the server's own rule reads
 * rather than listing those statuses again — a hand-written map can offer a
 * button the server then refuses, or leave a newly-added status with none.
 */
export function stagesFor<TStage extends string>(
  statuses: readonly TStage[],
  buttons: WorkflowButton[],
): Partial<Record<TStage, WorkflowButton[]>> {
  return Object.fromEntries(statuses.map((status) => [status, buttons])) as Partial<
    Record<TStage, WorkflowButton[]>
  >
}

/**
 * Which stage a document is at, from the operation and the status field's value.
 *
 * ⚠ **An unsaved document is `CREATE_STAGE` whatever the status field holds.**
 * A collection whose `status` defaults to a stage a job owns would otherwise
 * offer the create form the buttons of a document already being worked.
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
