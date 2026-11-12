import { ANY_STATE, type Move, type StateMachine } from '@/lib/stateMachine/machine'

import { LADDER, STAGES, VERIFICATION_STAGES, type VerificationStage } from './stages'

/**
 * Every writer that may move an event's verification stage.
 *
 * A stage change naming none of these is refused — including a manager's own
 * `PATCH`. `verificationStage` is `admin.readOnly`, which is the admin UI
 * alone, so before the guard any manager holding `events: update` could set it
 * to any value and nothing applied what it implied.
 *
 * `import` is the Atlas seed importer, which mirrors an external system of
 * record: it may land a row on any stage, because the dump decides.
 */
export const EVENT_ACTORS = [
  'adoption',
  'community',
  'hook:save',
  'import',
  'job:expireEvents',
  'verify',
] as const

export type EventActor = (typeof EVENT_ACTORS)[number]

/**
 * The reminder ladder, as moves.
 *
 * Derived from `STAGES` rather than listed again: the job advances a stage to
 * whatever its own `onDue` action names, so a second spelling here would be
 * free to disagree with what the job actually does.
 */
const LADDER_MOVES: Move<VerificationStage, EventActor>[] = LADDER.flatMap((stage) => {
  const action = STAGES[stage].onDue
  if (action.kind !== 'remind') return []
  return [{ from: [stage], to: action.nextStage, by: ['job:expireEvents'] as const }]
})

/** Where a manager's save may re-open a verification cycle from. */
const RE_SAVE_FROM: VerificationStage[] = [...LADDER, 'expired', 'finished']

/**
 * The event verification lifecycle, as the moves that exist.
 *
 * `STAGES` says what each stage *means* — published, managed, what falls due.
 * This says who may move between them, which was scattered across a hook, a
 * job, two endpoints and a vote-counting hook before #1121.
 *
 * Trashing is absent on purpose: the `expired` grace terminal and the
 * `finished` retention window both write `deletedAt`, leaving the stage where
 * it was, so neither is a move.
 */
export const EVENT_MACHINE: StateMachine<VerificationStage, EventActor> = {
  name: 'verification stage',
  field: 'verificationStage',
  moves: [
    ...LADDER_MOVES,
    // The schedule ran out. Terminal from wherever the event stood.
    { from: ANY_STATE, to: 'finished', by: ['job:expireEvents'] },

    // A manager's save re-opens the cycle (the Atlas is re-verified on every
    // save), and revives a `finished` event whose schedule was extended.
    { from: RE_SAVE_FROM, to: 'verified', by: ['hook:save'] },
    // A revived or restored event with nobody managing it awaits adoption
    // again, rather than letting a managed stage's deadline trash a live one.
    // Any managed stage can be restored from: the job trashes `expired` and
    // `finished`, and a manager may trash a listing at any stage by hand.
    { from: RE_SAVE_FROM, to: 'unverified', by: ['hook:save'] },

    // The community voted a listing down.
    { from: ['unverified'], to: 'denied', by: ['community'] },

    // ⚠ **Not from `finished`.** Extending the schedule is what revives such an
    // event, and that save verifies it — so a verify link or button reaching a
    // finished event is one whose schedule still ends in the past (#603).
    {
      from: VERIFICATION_STAGES.filter((stage) => stage !== 'finished'),
      to: 'verified',
      by: ['verify'],
    },

    // Assigning a manager adopts the listing, published, whichever way the
    // community had voted.
    { from: ['unverified', 'denied'], to: 'verified', by: ['adoption'] },

    { from: ANY_STATE, to: 'unverified', by: ['import'] },
    { from: ANY_STATE, to: 'denied', by: ['import'] },
    { from: ANY_STATE, to: 'verified', by: ['import'] },
    { from: ANY_STATE, to: 'finished', by: ['import'] },
  ],
}
