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
 * When a rule's buttons are on offer at all.
 *
 * ⚠ **A rule may name the viewer, and a rule offering a privileged move must.**
 * A button is an offer and the server owes its own guard, so an offer the guard
 * will refuse is the one shape to avoid — a control that can only answer 403
 * (`docs/rules/access.md`). `user-submissions` settles a spam refusal on an
 * admin's authority alone, so its rule says so here as well as in `reviewMove`.
 *
 * `field`/`equals` match by value (`!==`), so an object or an array would be a
 * test nothing can satisfy.
 */
export interface WorkflowRuleCondition {
  equals?: boolean | null | number | string
  /** A form field whose value `equals` is compared against. */
  field?: string
  /** The signed-in manager's own `type`. */
  userType?: 'admin'
}

/** One conditioned set of stages. A rule with no `when` applies to every document. */
export interface WorkflowRule<TStage extends string = string> {
  /** Buttons per stage. An empty array is a stage with no action, not a missing one. */
  stages: Partial<Record<TStage, WorkflowButton[]>>
  when?: WorkflowRuleCondition
}

/**
 * `TStage` is the collection's own stage vocabulary, so a declaration names it
 * and a typo is a type error rather than a stage that silently renders the
 * fallback — `satisfies WorkflowButtonsProps<ImportStatus | typeof CREATE_STAGE>`.
 */
export interface WorkflowButtonsProps<TStage extends string = string> {
  /** What a stage no rule names renders: Payload's own button, or nothing. */
  fallback: 'publish' | 'save' | 'saveDraft' | null
  /**
   * The rules, in precedence order: the first that both applies and names the
   * document's stage wins, and a stage no applying rule names takes `fallback`.
   *
   * One ordered list rather than a map plus a gate plus an ungated map, because
   * a slot serving several kinds of document decides over **(kind, viewer,
   * stage)** and precedence between those is the thing a reader most needs to
   * see. `user-submissions` holds four intakes sharing one status vocabulary,
   * so its first rule is the admin's spam settlement and its second the
   * proposal review — and a contact row matches neither, which is how it keeps
   * its ordinary Save (`docs/rules/admin-ui.md`).
   */
  rules: WorkflowRule<TStage>[]
  /** Form field whose value picks the stage; omit to key on the create alone. */
  statusField?: string
}

/**
 * Whether a rule is on offer, given the form's own values and the viewer.
 *
 * An absent test passes: a rule naming only `userType` applies at every field
 * value, and one naming only a field applies to every viewer.
 */
export function ruleApplies(
  when: undefined | WorkflowRuleCondition,
  context: { field: (name: string) => unknown; isAdmin: boolean },
): boolean {
  if (!when) return true
  if (when.userType === 'admin' && !context.isAdmin) return false
  if (when.field !== undefined && context.field(when.field) !== when.equals) return false
  return true
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
