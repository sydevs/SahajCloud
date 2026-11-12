import type { CollectionSlug, Payload, PayloadRequest, RequestContext, Where } from 'payload'

import { updateIfUnchanged } from '@/lib/atomicWrites/updateIfUnchanged'

import { withActor } from './actor'
import { can, type StateMachine } from './machine'

/**
 * The write a transition makes, where the default one will not do.
 *
 * ⚠ **Two reasons, and a caller says which.** Either the collection's state
 * writes must not re-validate the stored document — Events, where a manager's
 * unrelated data problem would otherwise pin a listing on a stage forever
 * (#842) — or the caller needs an id-addressed write: one that throws
 * `Forbidden` rather than narrowing the selection, or that hands back the
 * document it wrote. The second kind forgoes the claim, which costs nothing
 * where no slow work precedes the write.
 */
export type TransitionWrite = (args: {
  data: Record<string, unknown>
  /** The claim: the state as read, plus whatever else the caller read. */
  expect: Where
  context: RequestContext
}) => Promise<boolean>

/**
 * Make one move, and claim it.
 *
 * The claim is the whole point. A writer reads a row, does slow work — sends an
 * email, renders a page — and writes afterwards; the state it read is ANDed
 * into the write's own `where`, so a move decided in that window stands and
 * this one reports `false` rather than overwriting it (#1116).
 *
 * The write runs as an ordinary `payload.update`, hooks and all, so the cache
 * purge, the sidebar revalidation and the import-status refresh still fire. It
 * carries the actor on its context, which is what the machine's guard reads.
 *
 * A move absent from the table throws rather than returning `false`: a caller
 * naming one is a defect in this repository, not a race with another writer.
 */
export async function transition<State extends string, Actor extends string, Doc>(args: {
  payload: Payload
  machine: StateMachine<State, Actor, Doc>
  collection: CollectionSlug
  id: number | string
  from: State
  to: State
  by: Actor
  /** What lands with the move — the stage's own fields, a watermark, `_status`. */
  data?: Record<string, unknown>
  /** More of what the caller read, ANDed into the claim. */
  expect?: Where
  req?: PayloadRequest
  context?: RequestContext
  depth?: number
  overrideAccess?: boolean
  /** Overrides the plain update: see {@link TransitionWrite}. */
  write?: TransitionWrite
}): Promise<boolean> {
  const { machine, collection, id, from, to, by, data, expect, write } = args

  if (!can(machine, from, to, by)) {
    throw new Error(`transition: ${by} cannot move ${machine.name} from ${from} to ${to}`)
  }

  const held: Where = { [machine.field]: { equals: from } }
  const claim: Where = expect ? { and: [held, expect] } : held
  const payload = { ...data, [machine.field]: to }
  const context = withActor(args.context, machine, by)

  if (write) return write({ data: payload, expect: claim, context })

  return updateIfUnchanged({
    payload: args.payload,
    collection,
    id,
    expect: claim,
    data: payload,
    context,
    depth: args.depth,
    overrideAccess: args.overrideAccess,
    req: args.req,
  })
}
