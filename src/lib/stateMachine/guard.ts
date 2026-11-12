import type { CollectionBeforeChangeHook, PayloadRequest, RequestContext } from 'payload'

import { ValidationError } from 'payload'

import { capture } from '@/plugins/sentry/capture'

import { declaredActor } from './actor'
import { can, type StateMachine } from './machine'

/** What one write means for a machine. */
export type TransitionVerdict =
  | { kind: 'legal' }
  | { kind: 'illegal'; reason: string }
  /** The write never moved the state, so there is nothing to judge. */
  | { kind: 'none' }

/**
 * Judge one write against the table.
 *
 * `to` absent means the write left the column alone — a collection
 * `beforeChange` receives the patch, not the merged document, so an absent key
 * is the only way to tell "unchanged" from "set to the value it already held".
 * Both are `none`: the document form re-posts every stored field.
 */
export function judgeTransition<State extends string, Actor extends string>(args: {
  machine: StateMachine<State, Actor>
  from: State | null | undefined
  to: State | null | undefined
  /** `null` for a writer that named none. */
  by: Actor | null
}): TransitionVerdict {
  const { machine, from, to, by } = args
  if (from == null || to == null || to === from) return { kind: 'none' }

  if (by === null) {
    return {
      kind: 'illegal',
      reason: `This change to ${machine.name} names no writer, so nothing can authorise it.`,
    }
  }

  if (!can(machine, from, to, by)) {
    return { kind: 'illegal', reason: `${by} cannot move ${machine.name} from ${from} to ${to}.` }
  }

  return { kind: 'legal' }
}

/**
 * Refuse a move, and report it.
 *
 * Every refusal is an incident: either a writer the table has not been told
 * about, or a request reaching a move its surface never offered. It is reported
 * at `warning` rather than `error` because the write is refused — nothing is
 * corrupt, but nobody would otherwise learn that a writer is being turned away.
 */
export function refuseTransition(args: {
  machine: StateMachine<string, string>
  collection: string
  from: unknown
  to: unknown
  by: string | null
  reason: string
  req?: PayloadRequest
}): never {
  const { machine, collection, from, to, by, reason, req } = args

  capture({
    message: `Refused a ${machine.name} change that is not in the table`,
    level: 'warning',
    tags: { collection, lifecycle: machine.name, actor: by ?? 'none' },
    extra: { from, to, reason },
    ...(req?.user ? { user: { id: String(req.user.id) } } : {}),
  })

  throw new ValidationError({ errors: [{ path: machine.field, message: reason }] })
}

export interface TransitionGuardConfig<State extends string, Actor extends string> {
  machine: StateMachine<State, Actor>
  /**
   * Who this write speaks for, where the declared actor does not answer it —
   * the manager at the keyboard, whom no write declares.
   */
  actorFromRequest: (req: PayloadRequest) => Actor | null
  /** The declared actors this machine accepts, so another machine's cannot leak in. */
  actors: readonly Actor[]
}

/**
 * The one `beforeChange` guard a machine owns: a stage change not in the table
 * is refused, reported, and never written.
 *
 * ⚠ **Register it after any hook that writes the column itself.** A collection
 * `beforeChange` array runs in order, so a hook deriving the stage must have
 * run — and declared its actor — before this judges the patch it produced.
 */
export function guardTransition<State extends string, Actor extends string>(
  config: TransitionGuardConfig<State, Actor>,
): CollectionBeforeChangeHook {
  const { machine, actorFromRequest, actors } = config

  return ({ collection, data, originalDoc, req, context }) => {
    // No original document means a create: the column holds its default or a
    // writer's opening value, and there is no move to judge.
    if (!originalDoc) return data

    const from = originalDoc[machine.field] as State | undefined
    const to = (machine.field in data ? data[machine.field] : undefined) as State | undefined

    const by = resolveActor({ actors, actorFromRequest, req, context })
    const verdict = judgeTransition({ machine, from, to, by })
    if (verdict.kind !== 'illegal') return data

    refuseTransition({
      machine,
      collection: collection?.slug ?? machine.field,
      from,
      to,
      by,
      reason: verdict.reason,
      req,
    })
  }
}

/**
 * The actor a write speaks for.
 *
 * A declared one wins, and is checked against this machine's own vocabulary —
 * one request can write both collections, and an `events` actor left on the
 * context must not answer for a submission.
 */
export function resolveActor<Actor extends string>(args: {
  actors: readonly Actor[]
  actorFromRequest: (req: PayloadRequest) => Actor | null
  req: PayloadRequest
  context: RequestContext | undefined
}): Actor | null {
  const { actors, actorFromRequest, req, context } = args
  const declared = declaredActor(context)
  if (declared !== undefined && (actors as readonly string[]).includes(declared)) {
    return declared as Actor
  }
  return actorFromRequest(req)
}
