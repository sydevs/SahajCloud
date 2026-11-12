/**
 * A lifecycle declared once, as a table of the moves that exist.
 *
 * Two collections carry a column whose value walks a fixed set of stages, and
 * before this each writer decided for itself what it was allowed to do: a hook
 * here, a job there, an endpoint somewhere else, with only a manager's
 * submission review checked at all. A move that no reader could find was a
 * move nobody could refuse.
 *
 * A machine states the column it governs and every `(from, to, by)` that is
 * legal. `can` is the only lookup, `transition` is the only write, and one
 * `beforeChange` guard per machine refuses everything else.
 *
 * ⚠ **A table, a lookup and a claim — nothing more.** No actions, no
 * side-effect registry, no nested states, no timers. A machine that needs one
 * of those wants XState, not a bigger version of this (#1120).
 */

/** A move's `from` standing for every state: the job's "any stage → finished". */
export const ANY_STATE = '*' as const

export interface Move<State extends string, Actor extends string> {
  /** The states this move may start from, or {@link ANY_STATE}. */
  readonly from: readonly State[] | typeof ANY_STATE
  readonly to: State
  /** Every writer that may make it. A writer absent here is refused. */
  readonly by: readonly Actor[]
}

export interface StateMachine<State extends string, Actor extends string> {
  /** What the lifecycle is called, in a refusal and in its Sentry report. */
  readonly name: string
  /** The document column the state lives in. */
  readonly field: string
  readonly moves: readonly Move<State, Actor>[]
}

const starts = <State extends string, Actor extends string>(
  move: Move<State, Actor>,
  from: State,
): boolean => move.from === ANY_STATE || move.from.includes(from)

/** Whether `by` may move a document from `from` to `to`. */
export function can<State extends string, Actor extends string>(
  machine: StateMachine<State, Actor>,
  from: State,
  to: State,
  by: Actor,
): boolean {
  return machine.moves.some(
    (move) => move.to === to && starts(move, from) && move.by.includes(by),
  )
}

/**
 * Every state `by` may move a document at `from` to.
 *
 * What a surface offering the move reads, so a button and the guard behind it
 * cannot name different sets.
 */
export function targetsFor<State extends string, Actor extends string>(
  machine: StateMachine<State, Actor>,
  from: State,
  by: Actor,
): State[] {
  const targets = machine.moves
    .filter((move) => starts(move, from) && move.by.includes(by))
    .map((move) => move.to)
  return [...new Set(targets)]
}

/** Every state `by` may move a document out of — the states where it has work. */
export function originsFor<State extends string, Actor extends string>(
  machine: StateMachine<State, Actor>,
  states: readonly State[],
  by: Actor,
): State[] {
  return states.filter((state) => targetsFor(machine, state, by).length > 0)
}
