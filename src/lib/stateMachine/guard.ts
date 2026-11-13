import type { FieldHook, PayloadRequest, RequestContext } from 'payload'

import { ValidationError } from 'payload'

import { capture } from '@/plugins/sentry/capture'

import { declaredActor } from './actor'
import {
  type Move,
  type MoveContext,
  type Opening,
  type Refusal,
  startsFrom,
  type StateMachine,
} from './machine'

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

export interface Refused<Actor extends string> {
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

export type Verdict<State extends string, Actor extends string, Doc> =
  | { kind: 'unchanged' }
  | { kind: 'allowed'; move: Move<State, Actor, Doc>; by: Actor }
  | Refused<Actor>

/** Whether a create may stand, judged by {@link judgeOpening}. */
export type OpeningVerdict<Actor extends string> = { kind: 'opened' } | Refused<Actor>

const refused = <Actor extends string>(
  machine: Pick<StateMachine<string, string, never>, 'field'>,
  by: Actor | null,
  refusal: Refusal,
): Refused<Actor> =>
  typeof refusal === 'string'
    ? { kind: 'refused', by, field: machine.field, message: refusal, incident: true }
    : { kind: 'refused', by, field: refusal.field, message: refusal.message, incident: false }

/** A table row a writer is judged against: a move, or an opening. */
type Row<Actor extends string, Doc> = Pick<Opening<never, Actor, Doc>, 'by' | 'refusal' | 'when'>

/**
 * Which of the rows already matching a write's own shape the writer lands on.
 *
 * ⚠ **The refusal a person reads prefers the row they could not reach.** Where
 * a row exists for this document but for another person, its `refusal`
 * explains the authority they lack ("Only an admin can …") — a failed
 * condition on a row of their own would describe one they cannot use anyway.
 *
 * Shared by the move and the opening judgement so the two cannot answer a
 * writer differently.
 */
function pick<Actor extends string, Doc, R extends Row<Actor, Doc>>(
  rows: readonly R[],
  writer: Extract<Writer<Actor>, { kind: 'person' | 'system' }>,
  ctx: MoveContext<Doc>,
): { kind: 'matched'; row: R } | { kind: 'refused'; refusal: Refusal } | { kind: 'unmatched' } {
  const by = writer.actor
  let failed: Refusal | undefined
  for (const row of rows) {
    if (!row.by.includes(by)) continue
    const answer = row.when ? row.when(ctx) : true
    if (answer === true) return { kind: 'matched', row }
    failed ??= answer
  }

  if (writer.kind === 'person') {
    const theirs = rows.find(
      (row) => !row.by.includes(by) && row.refusal && (!row.when || row.when(ctx) === true),
    )
    if (theirs?.refusal) return { kind: 'refused', refusal: theirs.refusal }
  }
  if (failed !== undefined) return { kind: 'refused', refusal: failed }
  return { kind: 'unmatched' }
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
 * A create has no `from`, so it is judged by {@link judgeOpening} instead.
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
  if (writer.kind === 'none') {
    return refused<Actor>(
      machine,
      null,
      `This change to ${machine.name} names no writer, so nothing can authorise it.`,
    )
  }
  if (writer.kind === 'refused') return refused<Actor>(machine, null, writer.reason)

  const by = writer.actor
  // `null` is in no move, so an explicit `null` finds no route.
  const routes = machine.moves.filter((move) => move.to === to && startsFrom(move, from))
  const picked = pick(routes, writer, { doc, req })
  if (picked.kind === 'matched') return { kind: 'allowed', move: picked.row, by }
  if (picked.kind === 'refused') return refused(machine, by, picked.refusal)

  return refused(
    machine,
    by,
    to === null
      ? `${by} cannot move ${machine.name} from ${from} to nothing.`
      : (machine.refusal?.({ from, to }) ??
          `${by} cannot move ${machine.name} from ${from} to ${to}.`),
  )
}

/**
 * Judge a create against the machine: where the row opens, or why that is
 * refused.
 *
 * `machine.opensAt` stands for every writer — it is what the column does on
 * its own. Every other state needs an `opens` row, which is what makes the
 * table the whole declaration of a lifecycle rather than its moves alone: a
 * row could otherwise be created at a state no writer may ever move it to.
 *
 * ⚠ **A missing or unlisted value is left to the column.** It is `required`
 * and its options are the machine's states, so Payload's own validator
 * answers both — refusing here would report a person's validation mistake as a
 * writer the table was not told about.
 */
export function judgeOpening<State extends string, Actor extends string, Doc>(args: {
  machine: StateMachine<State, Actor, Doc>
  at: State | null | undefined
  /** The row as the create would write it: what an opening's condition reads. */
  doc: Partial<Doc>
  req: PayloadRequest
  context?: RequestContext
}): OpeningVerdict<Actor> {
  const { machine, at, doc, req } = args
  if (at == null || !machine.states.includes(at)) return { kind: 'opened' }
  if (at === machine.opensAt) return { kind: 'opened' }

  const writer = resolveWriter(machine, req, args.context ?? req.context)
  if (writer.kind === 'none') {
    return refused<Actor>(
      machine,
      null,
      `Opening ${machine.name} at ${at} names no writer, so nothing can authorise it.`,
    )
  }
  if (writer.kind === 'refused') return refused<Actor>(machine, null, writer.reason)

  const openings = (machine.opens ?? []).filter((opening) => opening.at === at)
  const picked = pick(openings, writer, { doc, req })
  if (picked.kind === 'matched') return { kind: 'opened' }
  if (picked.kind === 'refused') return refused(machine, writer.actor, picked.refusal)

  return refused(machine, writer.actor, `${writer.actor} cannot open ${machine.name} at ${at}.`)
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
  operation: 'create' | 'update'
  from: unknown
  to: unknown
  verdict: Refused<string>
  req: PayloadRequest
}): never {
  const { machine, collection, operation, from, to, verdict, req } = args

  if (verdict.incident) {
    capture({
      message: `Refused a ${machine.name} ${operation === 'create' ? 'opening' : 'change'} that is not in the table`,
      level: 'warning',
      tags: { collection, lifecycle: machine.name, actor: verdict.by ?? 'none' },
      extra: { from, to, reason: verdict.message },
      ...(req.user ? { user: { id: String(req.user.id) } } : {}),
    })
  }

  throw new ValidationError({ errors: [{ path: verdict.field, message: verdict.message }] })
}

/**
 * The guard `stateMachineField` mounts on the column: a state change — or a
 * create opening at a state — not in the table is refused, reported, and never
 * written.
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
    const refuse = (verdict: Refused<Actor>, from: unknown): never =>
      refuseTransition({
        machine: machine as unknown as StateMachine<string, string, never>,
        collection: collection?.slug ?? machine.field,
        operation: operation === 'create' ? 'create' : 'update',
        from,
        to: value,
        verdict: verdict as Refused<string>,
        req,
      })

    if (operation === 'create') {
      // The patch *is* the row on a create, and Payload has already filled the
      // column's default by the time a `beforeChange` hook runs.
      const opening = judgeOpening({
        machine,
        at: value as State | null | undefined,
        doc: data as Partial<Doc>,
        req,
        context,
      })
      return opening.kind === 'refused' ? refuse(opening, undefined) : value
    }
    if (!originalDoc) return value

    const verdict = judgeTransition({
      machine,
      from: previousValue as State | null | undefined,
      to: value as State | null | undefined,
      doc: { ...originalDoc, ...data } as Partial<Doc>,
      req,
      context,
    })
    return verdict.kind === 'refused' ? refuse(verdict, previousValue) : value
  }
}
