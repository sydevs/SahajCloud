import type { PayloadRequest, RequestContext } from 'payload'

/**
 * Which writer a stage change speaks for, carried on the write's own
 * `req.context`.
 *
 * The guard runs as a `beforeChange` hook and sees a patch, not a call stack,
 * so the writer has to say who it is. A write that names nobody is refused —
 * which is the point: a new job or endpoint that moves a stage is refused until
 * its move is in the table, rather than silently joining the ones that were
 * never checked.
 *
 * A manager's own save through the admin panel names no actor and does not need
 * to: the guard resolves one from `req.user`.
 */
const STAGE_ACTOR = 'stageActor'

/** The context a write carries so the guard can judge it. */
export function withActor<Actor extends string>(
  context: RequestContext | undefined,
  by: Actor,
): RequestContext {
  return { ...context, [STAGE_ACTOR]: by }
}

/** The actor a write declared, or `undefined` where it declared none. */
export function declaredActor(context: RequestContext | undefined): string | undefined {
  const value = context?.[STAGE_ACTOR]
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
export function declareActor<Actor extends string>(req: PayloadRequest, by: Actor): void {
  req.context[STAGE_ACTOR] = by
}
