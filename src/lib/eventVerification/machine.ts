import { ANY_STATE, defineStateMachine, type Move } from '@/lib/stateMachine/machine'

import {
  DEFAULT_VERIFICATION_STAGE,
  LADDER,
  LADDER_STEPS,
  VERIFICATION_STAGES,
  type VerificationStage,
} from './stages'

/**
 * Every writer that may move an event's verification stage.
 *
 * A stage change naming none of these is refused — including a manager's own
 * `PATCH`. `verificationStage` is `admin.readOnly`, which is the admin UI
 * alone, so before the guard any manager holding `events: update` could set it
 * to any value and nothing applied what it implied.
 *
 * `import` mirrors an external system of record — the legacy Atlas's own rows,
 * or a volunteer's bulk upload: it may land a row on any stage, because the
 * file decides. `proposal` only ever creates one: an accepted submission.
 */
export const EVENT_ACTORS = [
  'adoption',
  'community',
  'hook:save',
  'import',
  'job:expireEvents',
  'proposal',
  'verify',
] as const

export type EventActor = (typeof EVENT_ACTORS)[number]

/**
 * The reminder ladder, as moves.
 *
 * Read off the ladder's own steps rather than listed again: the job advances a
 * stage to whatever its own `onDue` action names, so a second spelling here
 * would be free to disagree with what the job actually does.
 */
const LADDER_MOVES: Move<VerificationStage, EventActor>[] = LADDER_STEPS.map((step) => ({
  from: [step.from],
  to: step.to,
  by: ['job:expireEvents'] as const,
}))

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
export const EVENT_MACHINE = defineStateMachine<VerificationStage, EventActor>({
  name: 'verification stage',
  field: 'verificationStage',
  states: VERIFICATION_STAGES,
  // ⚠ **Every one of them, and no `person`.** `verificationStage` is
  // `admin.readOnly`, which is the admin UI alone, so before the guard any
  // manager holding `events: update` could `PATCH` it to any value with nothing
  // applying what the stage implies. Every legitimate change is derived by a
  // hook or made by an operation, and each of those names itself — a manager's
  // own save names nobody, and is refused.
  declarable: EVENT_ACTORS,
  // A class goes on the map verified: the admin's own create form, and an
  // accepted proposal that named a manager, both land here.
  opensAt: DEFAULT_VERIFICATION_STAGE,
  opens: [
    // A listing nobody has taken on yet — an accepted proposal with no manager
    // named. It waits for adoption rather than claiming to be verified.
    { at: 'unverified', by: ['proposal'] },

    // The file decides, so an import may open a listing anywhere.
    ...VERIFICATION_STAGES.map((stage) => ({ at: stage, by: ['import'] as const })),
  ],
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

    // The dump decides, so the importer may land a listing anywhere.
    ...VERIFICATION_STAGES.map((stage) => ({
      from: ANY_STATE,
      to: stage,
      by: ['import'] as const,
    })),
  ],
})
