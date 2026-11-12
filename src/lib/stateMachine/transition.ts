import type { CollectionSlug, Payload, PayloadRequest, RequestContext, Where } from 'payload'

import { updateIfUnchanged } from '@/lib/atomicWrites/updateIfUnchanged'

import { withActor } from './actor'
import { can, type StateMachine } from './machine'

/**
 * The write a transition makes, for a collection whose stage changes cannot go
 * through a plain `payload.update`.
 *
 * Events is that collection: its stage writes are derived bookkeeping, and
 * re-validating the stored document would let a manager's unrelated data
 * problem pin a listing on a stage forever (#842). It passes
 * `updateEventBookkeeping` here rather than this module learning Payload's
 * validation-scoping flag on its behalf.
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
export async function transition<State extends string, Actor extends string>(args: {
  payload: Payload
  machine: StateMachine<State, Actor>
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
  const context = withActor(args.context, by)

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
