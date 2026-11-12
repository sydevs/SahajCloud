import type { PayloadRequest } from 'payload'

/**
 * A lifecycle declared once, as a table of the moves that exist.
 *
 * Two collections carry a column whose value walks a fixed set of stages, and
 * before this each writer decided for itself what it was allowed to do: a hook
 * here, a job there, an endpoint somewhere else, with only a manager's
 * submission review checked at all. A move that no reader could find was a
 * move nobody could refuse.
 *
 * A machine states the column it governs, its states, every `(from, to, by)`
 * that is legal, and who may name themselves as a writer. `can` is the table's
 * lookup, `transition` is the only write, and the guard `stateMachineField`
 * mounts on the column refuses everything else (#1121).
 *
 * ⚠ **A table, its conditions, a lookup and a claim — nothing more.** No
 * actions, no side-effect registry, no nested states, no timers. A move's
 * `name` is how a collection's own `afterChange` knows which decision it is
 * acting on; the work stays in that hook. A machine that needs more wants
 * XState, not a bigger version of this (#1120).
 *
 * ⚠ **The conditions widen the limit #1121 set — a table, a lookup and the
 * claim — and that was the price of one table rather than two.** A review
 * decision is a row only if a row can carry the condition it turns on, so
 * folding `reviewMove` in brought `when`, `person` and `refusal` with it. Each
 * stays pure and nothing but the guard reads one, which is what kept the
 * actions, the nested states and the timers out behind them.
 */

/** A move's `from` standing for every state: the job's "any stage → finished". */
export const ANY_STATE = '*' as const

/**
 * Why a move was refused: a sentence for the move itself, or one aimed at
 * another field — a precondition the person can fix there, such as the region
 * an accept needs.
 */
export type Refusal = string | { field: string; message: string }

/** What a move's condition sees: the document as the write would leave it. */
export interface MoveContext<Doc> {
  doc: Partial<Doc>
  req: PayloadRequest
}

export interface Move<State extends string, Actor extends string, Doc = unknown> {
  /** The states this move may start from, or {@link ANY_STATE}. */
  readonly from: readonly State[] | typeof ANY_STATE
  readonly to: State
  /** Every writer that may make it. A writer absent here is refused. */
  readonly by: readonly Actor[]
  /** The decision this move is, for the hook that acts on it. */
  readonly name?: string
  /**
   * A condition on the document, judged by the guard alone.
   *
   * ⚠ **Synchronous and pure over the document and the request.** `can` never
   * calls it, so a button map and the table's own tests stay enumerable
   * without a document; and a read here would be slow and could race, which is
   * what `transition`'s claim already answers.
   */
  readonly when?: (ctx: MoveContext<Doc>) => true | Refusal
  /** What a person who is not in `by` is told, where another person may. */
  readonly refusal?: string
}

/** Who the person behind a request is, or why they may not move this column at all. */
export type PersonResolution<Actor extends string> = Actor | { refused: string } | null

export interface StateMachine<State extends string, Actor extends string, Doc = unknown> {
  /** What the lifecycle is called, in a refusal and in its Sentry report. */
  readonly name: string
  /** The document column the state lives in. */
  readonly field: string
  /** Every state, in the order the column's options list them. */
  readonly states: readonly State[]
  readonly moves: readonly Move<State, Actor, Doc>[]
  /**
   * The actors a write may **name** on its context, which is never every actor
   * in the table.
   *
   * ⚠ **Not derived from the moves**, on purpose. `req.context` is written by
   * whatever code made the call, so a declarable person would be an authority
   * check anything server-side could skip. Declaring is for a writer with no
   * person behind it; a person comes from {@link StateMachine.person}.
   */
  readonly declarable: readonly Actor[]
  /**
   * Who the person behind a request is, when the write names no writer.
   * Absent, a person's own save names nobody and is refused.
   */
  readonly person?: (req: PayloadRequest) => PersonResolution<Actor>
  /** The sentence for a move no row holds, where the default would not read well. */
  readonly refusal?: (args: { from: State; to: State }) => string
}

/** Declare a machine: the identity function, there to infer its types in one place. */
export function defineStateMachine<State extends string, Actor extends string, Doc = unknown>(
  machine: StateMachine<State, Actor, Doc>,
): StateMachine<State, Actor, Doc> {
  return machine
}

/** Whether a move may start from `from`. */
export const startsFrom = <State extends string>(
  move: { readonly from: readonly State[] | typeof ANY_STATE },
  from: State,
): boolean => move.from === ANY_STATE || move.from.includes(from)

/**
 * Whether the table holds a move `by` may make from `from` to `to`.
 *
 * ⚠ **The table alone, never a move's `when`.** This is what a button map and
 * a caller's pre-check read, neither of which has a document to judge; the
 * guard judges the condition on the write itself.
 */
export function can<State extends string, Actor extends string>(
  machine: {
    readonly moves: readonly {
      readonly from: readonly State[] | typeof ANY_STATE
      readonly to: State
      readonly by: readonly Actor[]
    }[]
  },
  from: State,
  to: State,
  by: Actor,
): boolean {
  return machine.moves.some(
    (move) => move.to === to && startsFrom(move, from) && move.by.includes(by),
  )
}

/** Every state the moves called `name` start from. */
export function startsOf<State extends string, Actor extends string, Doc>(
  machine: StateMachine<State, Actor, Doc>,
  name: string,
): State[] {
  const starts = new Set<State>()
  for (const move of machine.moves) {
    if (move.name !== name) continue
    for (const state of move.from === ANY_STATE ? machine.states : move.from) starts.add(state)
  }
  return machine.states.filter((state) => starts.has(state))
}
