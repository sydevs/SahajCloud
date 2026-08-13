import { addDays } from '@/lib/eventVerification/periods'
import {
  STAGE_DURATION_DAYS,
  VERIFICATION_STAGES,
  type VerificationStage,
} from '@/lib/eventVerification/stages'
import type { ReminderLevel } from '@/lib/notifications'

/**
 * What the ExpireEvents job does with an event whose `nextCheckAt` has come due.
 *
 * A discriminated union rather than one struct with mostly-null fields: the
 * three actions genuinely have different shapes, and keying on `kind` means a
 * caller narrows exhaustively instead of guessing which fields are meaningful
 * (see the discriminated-union preference in `.claude/rules/code-style.md`).
 */
export type StageAction =
  /** Send this stage's reminder, then advance to the next stage. */
  | {
      kind: 'remind'
      /** Reminder copy level. */
      level: ReminderLevel
      /** Whether to escalate to ancestor-region managers this stage. */
      includeRegion: boolean
      nextStage: VerificationStage
      /** Days the event dwells in `nextStage` before the following check. */
      offsetDays: number
      /**
       * Unpublish (`_status: 'draft'`) on this transition. Only the unverified
       * ladder unpublishes (`urgent → expired`); finishing deliberately leaves
       * `_status` alone so old Atlas links keep resolving (#603).
       */
      unpublish: boolean
    }
  /** Soft-delete: the `expired` grace period, or the `finished` retention window. */
  | { kind: 'trash' }
  /**
   * Nothing to do but re-arm the watermark from the schedule.
   *
   * The pre-adoption stages have no manager and so no cadence — the only thing
   * that can happen to them is the schedule running out, which the finish-check
   * handles before this action is ever reached. It exists as the **drift
   * guard**: without it, a due pre-adoption event (one whose schedule was
   * extended between the watermark being set and the run) would have no
   * transition, keep its past `nextCheckAt`, and be re-examined every night
   * forever.
   */
  | { kind: 'await-schedule' }

/**
 * The verification state machine, keyed by stage.
 *
 * Declared as an exhaustive `Record<VerificationStage, …>` on purpose: adding a
 * value to `VERIFICATION_STAGES` without deciding what the job does with it is
 * a compile error. The cautionary precedent is `bucketForEvent`, whose
 * `default:` case silently labelled both new stages "verified" until #624 added
 * explicit cases.
 *
 * The reminder ladder: due → escalated → urgent (final), each 1wk apart, then a
 * 2wk grace before unpublishing, then 2wk before trashing. Region managers are
 * looped in from `escalated` onward. The dedup key for a stage's sends is the
 * *current* (from) stage, so advancing never re-sends.
 */
const MACHINE: Record<VerificationStage, StageAction> = {
  // Pre-adoption: no manager, no cadence. Finishes when its schedule runs out;
  // adoption (assigning a manager) is the only other way out, and that happens
  // on save, not here.
  unverified: { kind: 'await-schedule' },
  denied: { kind: 'await-schedule' },

  verified: {
    kind: 'remind',
    level: 'due',
    includeRegion: false,
    nextStage: 'reminded',
    offsetDays: STAGE_DURATION_DAYS.verified,
    unpublish: false,
  },
  reminded: {
    kind: 'remind',
    level: 'escalated',
    includeRegion: true,
    nextStage: 'escalated',
    offsetDays: STAGE_DURATION_DAYS.reminded,
    unpublish: false,
  },
  escalated: {
    kind: 'remind',
    level: 'urgent',
    includeRegion: true,
    nextStage: 'urgent',
    offsetDays: STAGE_DURATION_DAYS.escalated,
    unpublish: false,
  },
  urgent: {
    kind: 'remind',
    level: 'expired',
    includeRegion: true,
    nextStage: 'expired',
    offsetDays: STAGE_DURATION_DAYS.urgent,
    unpublish: true,
  },

  // Terminals: the expired grace period elapsed, or a finished event outlived
  // its retention window. Neither sends an email.
  expired: { kind: 'trash' },
  finished: { kind: 'trash' },
}

/** What to do with a due event at this stage. No-op fallback for an unrecognised value. */
export function stageAction(stage: VerificationStage): StageAction {
  return MACHINE[stage] ?? { kind: 'await-schedule' }
}

/** Every stage that sends reminders, in ladder order — the escalation path. */
const LADDER: VerificationStage[] = VERIFICATION_STAGES.filter(
  (stage) => MACHINE[stage].kind === 'remind',
)

/**
 * Days from now until an unverified event at `stage` is unpublished — the sum
 * of the offsets up to the unpublish transition (`urgent → expired`). Every
 * reminder shows the same absolute unpublish date; once processing the
 * unpublish stage itself, it's 0 (unpublished today).
 *
 * Walks only `remind` rules, so it terminates on any other kind — a stage off
 * the ladder simply has nothing to count.
 */
export function daysUntilUnpublish(stage: VerificationStage): number {
  let total = 0
  let current: VerificationStage = stage
  const seen = new Set<VerificationStage>()
  while (!seen.has(current)) {
    seen.add(current)
    const action = MACHINE[current]
    if (action?.kind !== 'remind') break
    if (action.unpublish) break // processing this stage unpublishes — no further wait
    total += action.offsetDays
    current = action.nextStage
  }
  return total
}

/** The date an unverified event at `stage` is (or was) unpublished. */
export function unpublishDate(stage: VerificationStage, now: Date): Date {
  return addDays(now, daysUntilUnpublish(stage))
}

/** Exported for the tests that pin the ladder's shape. */
export { LADDER }
