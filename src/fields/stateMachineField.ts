import type { SelectField } from 'payload'

import { guardTransition } from '@/lib/stateMachine/guard'
import type { StateMachine } from '@/lib/stateMachine/machine'

export interface StateMachineFieldOptions<State extends string> extends Pick<
  SelectField,
  'access' | 'index' | 'label'
> {
  /** What each state is called in the admin. */
  labels: Record<State, string>
  /** Where a new document starts. */
  defaultValue: State
  /**
   * ⚠ **Pinned, never derived.** The Postgres enum is named by it, so a
   * derived name that changed would be a migration renaming the type under
   * every row.
   */
  enumName: string
  /** Presentation only: the column is always read-only in the admin. */
  admin?: Omit<NonNullable<SelectField['admin']>, 'readOnly'>
}

/**
 * The column a {@link StateMachine} governs: a required select whose options
 * are the machine's states, read-only in the admin, carrying the guard that
 * refuses every move the table does not hold.
 *
 * One declaration per lifecycle, so the options, the generated union in
 * `payload-types.ts` and the guard cannot name different sets — and a column
 * mounted without its guard cannot exist.
 *
 * ⚠ **`admin.readOnly` is the admin UI alone.** A field access rule admitting
 * managers admits every manager's `PATCH`; the guard is what holds the column.
 * A state moves only by a `transition` naming its writer, or by a person the
 * machine's `person` resolves — a review button's submit is one.
 */
export function stateMachineField<State extends string, Actor extends string, Doc>(
  machine: StateMachine<State, Actor, Doc>,
  options: StateMachineFieldOptions<State>,
): SelectField {
  const { labels, defaultValue, enumName, admin, ...rest } = options
  return {
    ...rest,
    name: machine.field,
    type: 'select',
    required: true,
    defaultValue,
    enumName,
    options: machine.states.map((value) => ({ label: labels[value], value })),
    admin: { ...admin, readOnly: true },
    hooks: { beforeChange: [guardTransition(machine)] },
  }
}
