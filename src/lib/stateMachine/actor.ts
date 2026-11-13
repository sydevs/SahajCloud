import type { StateMachine } from './machine'
import type { PayloadRequest, RequestContext } from 'payload'

/**
 * Which writer a state change speaks for, carried on the write's own
 * `req.context`.
 *
 * The guard runs as a `beforeChange` hook and sees a patch, not a call stack,
 * so the writer has to say who it is. A write that names nobody is refused —
 * which is the point: a new job or endpoint that moves a state is refused until
 * its move is in the table, rather than silently joining the ones that were
 * never checked.
 *
 * ⚠ **One key per machine, not one key for all of them.** Two machines share
 * actor names — `import` is declarable in both tables — and one request writes
 * both collections, so a single key would let a write declaring `import` for a
 * submission authorise any event-stage move on the same request. The key
 * carries the column, so an actor declared for one machine is invisible to the
 * other.
 *
 * A person is never declared here: a machine with people in its table resolves
 * them from the request itself (`StateMachine.person`), and one without — the
 * event stage — refuses a manager's own save outright.
 */
const keyFor = (machine: Pick<StateMachine<string, string, never>, 'field'>): string =>
  `stageActor:${machine.field}`

/** The context a write carries so the guard can judge it. */
export function withActor<Actor extends string>(
  context: RequestContext | undefined,
  machine: Pick<StateMachine<string, Actor, never>, 'field'>,
  by: Actor,
): RequestContext {
  return { ...context, [keyFor(machine)]: by }
}

/** The actor a write declared for this machine, or `undefined` where it declared none. */
export function declaredActor(
  context: RequestContext | undefined,
  machine: Pick<StateMachine<string, string, never>, 'field'>,
): string | undefined {
  const value = context?.[keyFor(machine)]
  return typeof value === 'string' ? value : undefined
}

/**
 * Name the writer from inside a hook that derives the state itself.
 *
 * A hook has no write of its own to attach a context to — it edits the patch in
 * flight — so it stamps the request the guard will read a moment later. Payload
 * gives one operation one `req.context`, which is the same object both hooks
 * see.
 */
export function declareActor<Actor extends string>(
  req: PayloadRequest,
  machine: Pick<StateMachine<string, Actor, never>, 'field'>,
  by: Actor,
): void {
  req.context[keyFor(machine)] = by
}
