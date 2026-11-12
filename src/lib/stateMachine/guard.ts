import type { FieldHook, PayloadRequest, RequestContext } from 'payload'

import { ValidationError } from 'payload'

import { capture } from '@/plugins/sentry/capture'

import { declaredActor } from './actor'
import { type Move, type Refusal, startsFrom, type StateMachine } from './machine'

/** Who is making a write, as one machine sees it. */
export type Writer<Actor extends string> =
  /** A job, hook or endpoint that named itself on the write's context. */
  | { kind: 'system'; actor: Actor }
  /** The person behind the request, as the machine's `person` resolves them. */
  | { kind: 'person'; actor: Actor }
  /** A person the machine answers for, who may not move this column at all. */
  | { kind: 'refused'; reason: string }
  | { kind: 'none' }

/**
 * Who a write speaks for: a declared system writer first, then the person.
 *
 * ⚠ **A declared system writer wins, whoever's request carries it.** A system
 * write can ride a person's request — the seed importer runs as an admin, and
 * the repeat-signup fold runs inside a client's create — and judging those by
 * what the person may do would refuse a move the writer is for. The other
 * direction is closed by `declarable`: no write may claim to be the person.
 *
 * One request can write both collections, and the two tables share actor names,
 * so the context key carries the column — an actor declared for another machine
 * is invisible here (`declaredActor`).
 */
export function resolveWriter<State extends string, Actor extends string, Doc>(
  machine: StateMachine<State, Actor, Doc>,
  req: PayloadRequest,
  context: RequestContext | undefined = req.context,
): Writer<Actor> {
  const declared = declaredActor(context, machine)
  if (declared !== undefined && (machine.declarable as readonly string[]).includes(declared)) {
    return { kind: 'system', actor: declared as Actor }
  }

  const person = machine.person?.(req) ?? null
  if (person === null) return { kind: 'none' }
  if (typeof person === 'object') return { kind: 'refused', reason: person.refused }
  return { kind: 'person', actor: person }
}

export type Verdict<State extends string, Actor extends string, Doc> =
  | { kind: 'unchanged' }
  | { kind: 'allowed'; move: Move<State, Actor, Doc>; by: Actor }
  | {
      kind: 'refused'
      by: Actor | null
      /** The field the refusal is reported on. */
      field: string
      message: string
      /**
       * Whether anybody should hear of it. A precondition aimed at another
       * field is a person's ordinary mistake; everything else is a writer the
       * table was not told about, or a request reaching a move no surface offers.
       */
      incident: boolean
    }

/**
 * Judge one write against the machine: nothing moved, the move it makes, or
 * why it is refused.
 *
 * `to` **undefined** means the write left the column alone — the guard sees the
 * patch, not the merged document, so an absent key is the only way to tell
 * "unchanged" from "set to the value it already held". Both are legal: the
 * document form re-posts every stored field.
 *
 * ⚠ An explicit `null` is not an absent key, and is judged like any other
 * target: the column is `required`, so nothing legitimate posts one, and a
 * refusal that names the writer beats the validator's later complaint.
 *
 * ⚠ **The refusal a person reads prefers the move they could not make.** Where
 * a move to the same state exists for this document but for another person,
 * its `refusal` explains the authority they lack ("Only an admin can …") — a
 * failed condition on a move of their own would describe a row they cannot
 * reach anyway.
 */
export function judgeTransition<State extends string, Actor extends string, Doc>(args: {
  machine: StateMachine<State, Actor, Doc>
  from: State | null | undefined
  to: State | null | undefined
  /** The document as the write would leave it: what a move's condition reads. */
  doc: Partial<Doc>
  req: PayloadRequest
  context?: RequestContext
}): Verdict<State, Actor, Doc> {
  const { machine, from, to, doc, req } = args
  if (from == null || to === undefined || to === from) return { kind: 'unchanged' }

  const writer = resolveWriter(machine, req, args.context ?? req.context)
  const refuse = (by: Actor | null, refusal: Refusal): Verdict<State, Actor, Doc> =>
    typeof refusal === 'string'
      ? { kind: 'refused', by, field: machine.field, message: refusal, incident: true }
      : { kind: 'refused', by, field: refusal.field, message: refusal.message, incident: false }

  if (writer.kind === 'none') {
    return refuse(
      null,
      `This change to ${machine.name} names no writer, so nothing can authorise it.`,
    )
  }
  if (writer.kind === 'refused') return refuse(null, writer.reason)

  const by = writer.actor
  const ctx = { doc, req }
  const holds = (move: Move<State, Actor, Doc>) => !move.when || move.when(ctx) === true
  // `null` is in no move, so an explicit `null` finds no route.
  const routes = machine.moves.filter((move) => move.to === to && startsFrom(move, from))

  let failed: Refusal | undefined
  for (const move of routes) {
    if (!move.by.includes(by)) continue
    const answer = move.when ? move.when(ctx) : true
    if (answer === true) return { kind: 'allowed', move, by }
    failed ??= answer
  }

  if (writer.kind === 'person') {
    const theirs = routes.find((move) => !move.by.includes(by) && move.refusal && holds(move))
    if (theirs?.refusal) return refuse(by, theirs.refusal)
  }
  if (failed !== undefined) return refuse(by, failed)

  return refuse(
    by,
    to === null
      ? `${by} cannot move ${machine.name} from ${from} to nothing.`
      : (machine.refusal?.({ from, to }) ??
          `${by} cannot move ${machine.name} from ${from} to ${to}.`),
  )
}

/**
 * Refuse a move, and report it when it is an incident (see {@link Verdict}).
 *
 * Reported at `warning` rather than `error` because the write is refused —
 * nothing is corrupt, but nobody would otherwise learn that a writer is being
 * turned away.
 */
export function refuseTransition(args: {
  machine: StateMachine<string, string, never>
  collection: string
  from: unknown
  to: unknown
  verdict: Extract<Verdict<string, string, never>, { kind: 'refused' }>
  req: PayloadRequest
}): never {
  const { machine, collection, from, to, verdict, req } = args

  if (verdict.incident) {
    capture({
      message: `Refused a ${machine.name} change that is not in the table`,
      level: 'warning',
      tags: { collection, lifecycle: machine.name, actor: verdict.by ?? 'none' },
      extra: { from, to, reason: verdict.message },
      ...(req.user ? { user: { id: String(req.user.id) } } : {}),
    })
  }

  throw new ValidationError({ errors: [{ path: verdict.field, message: verdict.message }] })
}

/**
 * The guard `stateMachineField` mounts on the column: a state change not in
 * the table is refused, reported, and never written.
 *
 * ⚠ **A field hook, so it runs after every collection `beforeChange`.** Payload
 * runs the collection's hooks before the field traversal
 * (`payload/dist/collections/operations/utilities/update.js`), so a hook that
 * derives the state — and declares its actor — has always run before this
 * judges the patch it produced. No registration order to keep.
 */
export function guardTransition<State extends string, Actor extends string, Doc>(
  machine: StateMachine<State, Actor, Doc>,
): FieldHook {
  return ({ collection, context, data, operation, originalDoc, previousValue, req, value }) => {
    // A create has no move to judge: the column holds its default or a
    // writer's opening value.
    if (operation !== 'update' || !originalDoc) return value

    const verdict = judgeTransition({
      machine,
      from: previousValue as State | null | undefined,
      to: value as State | null | undefined,
      doc: { ...originalDoc, ...data } as Partial<Doc>,
      req,
      context,
    })
    if (verdict.kind !== 'refused') return value

    refuseTransition({
      machine: machine as unknown as StateMachine<string, string, never>,
      collection: collection?.slug ?? machine.field,
      from: previousValue,
      to: value,
      verdict: verdict as Extract<Verdict<string, string, never>, { kind: 'refused' }>,
      req,
    })
  }
}
