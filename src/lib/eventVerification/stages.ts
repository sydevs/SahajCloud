// `ReminderLevel` is a *type-only* import, so it's erased at compile time —
// no runtime edge from this module into the email templates it's declared
// beside, which matters because client components import this file.
import type { ReminderLevel } from '@/lib/notifications'

import { addDays } from './periods'

/**
 * The one configuration of the event verification lifecycle: which stages
 * exist, what each one means for visibility and management, and what the
 * nightly ExpireEvents job does when a stage's watermark comes due.
 *
 * Everything downstream is **derived** from `STAGES` below rather than
 * restated: `PUBLISHED_STAGES`, `UNMANAGED_STAGES`, `STAGE_DURATION_DAYS`, the
 * reminder ladder, and whether a transition unpublishes. That last one used to
 * be an `unpublish` boolean written on the transition *and* a `PUBLISHED_STAGES`
 * membership list — two encodings of the same fact, free to disagree. Now a
 * transition unpublishes exactly when the stage it lands on isn't published.
 *
 * Lives in the cross-cutting lib because it's read by the Events schema, the
 * job, the admin components, the Atlas sidebar and the seed importer — no
 * owner folder could hold it without forcing a cross-owner internal import.
 *
 * The lifecycle:
 *
 * - `unverified` / `denied` — **pre-adoption**: no manager, so no cadence.
 *   Imported or accepted from a public submission (`unverified`, published so
 *   the community can vouch for it), or community-rejected (`denied`,
 *   unpublished and closed to further voting). Assigning a manager and saving
 *   is the only exit from either.
 * - `verified → reminded → escalated → urgent → expired` — the **reminder
 *   ladder**: each stage marks the last reminder sent, region managers join
 *   from `escalated`, and `expired` is unpublished then trashed.
 * - `finished` — the schedule ran out. Stays **published** so old Atlas links
 *   keep resolving (#603); dropped from the public feeds by `notFinishedWhere`
 *   rather than by unpublishing, and trashed once its retention window elapses.
 *
 * ("Archived" is a Payload soft-delete, not a stage.)
 */
export const VERIFICATION_STAGES = [
  'unverified',
  'denied',
  'verified',
  'reminded',
  'escalated',
  'urgent',
  'expired',
  'finished',
] as const

export type VerificationStage = (typeof VERIFICATION_STAGES)[number]

export const DEFAULT_VERIFICATION_STAGE: VerificationStage = 'verified'

/**
 * What the job does with an event whose `nextCheckAt` has come due.
 *
 * A discriminated union rather than one struct with mostly-null fields: the
 * three actions genuinely have different shapes, and keying on `kind` means a
 * caller narrows exhaustively instead of guessing which fields are meaningful
 * (see the discriminated-union preference in `docs/code-style.md`).
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

export interface StageConfig {
  /** The event stays published (`_status`) at this stage. */
  published: boolean
  /** A manager is required at this stage — `verified` always implies one. */
  managed: boolean
  /** What the job does when the watermark comes due. */
  onDue: StageAction
}

/**
 * Every stage, declared once.
 *
 * An exhaustive `Record<VerificationStage, …>` on purpose: adding a value to
 * `VERIFICATION_STAGES` without deciding what it means is a compile error. The
 * cautionary precedent is `bucketForEvent`, whose `default:` case silently
 * labelled both pre-adoption stages "verified" until #624 added explicit cases.
 */
export const STAGES: Record<VerificationStage, StageConfig> = {
  unverified: {
    published: true, // the whole point — the community can only vouch for what it can see
    managed: false,
    onDue: { kind: 'await-schedule' },
  },
  denied: {
    published: false, // the community's verdict took it off the map
    managed: false,
    onDue: { kind: 'await-schedule' },
  },

  verified: {
    published: true,
    managed: true,
    onDue: {
      kind: 'remind',
      level: 'due',
      includeRegion: false,
      nextStage: 'reminded',
      offsetDays: 7,
    },
  },
  reminded: {
    published: true,
    managed: true,
    onDue: {
      kind: 'remind',
      level: 'escalated',
      includeRegion: true,
      nextStage: 'escalated',
      offsetDays: 7,
    },
  },
  escalated: {
    published: true,
    managed: true,
    onDue: {
      kind: 'remind',
      level: 'urgent',
      includeRegion: true,
      nextStage: 'urgent',
      offsetDays: 7,
    },
  },
  urgent: {
    published: true,
    managed: true,
    // Lands on `expired`, which isn't published — so this is the transition
    // that unpublishes. Derived, not declared: see `transitionUnpublishes`.
    onDue: {
      kind: 'remind',
      level: 'expired',
      includeRegion: true,
      nextStage: 'expired',
      offsetDays: 14,
    },
  },

  expired: {
    published: false, // hidden from the public until re-verified
    managed: true,
    onDue: { kind: 'trash' }, // the grace period elapsed
  },
  finished: {
    // Still published (#603): its Atlas page must keep resolving for a late
    // seeker following an old link. Published ≠ publicly listed — the feeds
    // drop it via `notFinishedWhere`.
    published: true,
    // Exempt from the manager requirement: the job finishes run-out
    // pre-adoption events that were never adopted, and a terminal stage sends
    // no reminders for a manager to receive.
    managed: false,
    onDue: { kind: 'trash' }, // the retention window elapsed
  },
}

/** What to do with a due event at this stage. No-op fallback for an unrecognised value. */
export function stageAction(stage: VerificationStage): StageAction {
  return STAGES[stage]?.onDue ?? { kind: 'await-schedule' }
}

/** Whether an event at this stage should be published. */
export function isPublishedStage(stage: string | null | undefined): boolean {
  return STAGES[stage as VerificationStage]?.published ?? false
}

/**
 * Whether an event at this stage may have **no manager** — the pre-adoption
 * stages plus the `finished` terminal. This is the *validation* question ("is
 * the manager field required here?") and nothing else.
 *
 * Deliberately distinct from {@link isPreAdoptionStage}: `finished` is exempt
 * from the manager requirement but is emphatically not pre-adoption — it has a
 * retention deadline, and treating the two as one predicate silently skipped
 * that deadline (caught by `tests/unit/next-check-at.spec.ts`).
 */
export function isUnmanagedStage(stage: string | null | undefined): boolean {
  const config = STAGES[stage as VerificationStage]
  return config ? !config.managed : false
}

/**
 * Whether this is a **pre-adoption** stage: no manager, no cadence, and so no
 * clock of its own — the only thing that can happen is the schedule running
 * out. Derived from the stage's action rather than listed separately, so it
 * can't drift from what the job actually does.
 *
 * This is the question the watermark rule, the save hook and the
 * "nobody to notify" admin conditions are all asking.
 */
export function isPreAdoptionStage(stage: string | null | undefined): boolean {
  return STAGES[stage as VerificationStage]?.onDue.kind === 'await-schedule'
}

/**
 * Whether advancing out of `stage` unpublishes the event. True exactly when the
 * stage it lands on isn't a published one — today only `urgent → expired`.
 */
export function transitionUnpublishes(stage: VerificationStage): boolean {
  const action = STAGES[stage]?.onDue
  return action?.kind === 'remind' && !STAGES[action.nextStage].published
}

/** Stages where the event stays published. Derived — see `STAGES`. */
export const PUBLISHED_STAGES: VerificationStage[] = VERIFICATION_STAGES.filter(
  (stage) => STAGES[stage].published,
)

/** Stages that may have no manager. Derived — see `STAGES`. */
export const UNMANAGED_STAGES: VerificationStage[] = VERIFICATION_STAGES.filter(
  (stage) => !STAGES[stage].managed,
)

/** Every stage that sends reminders, in ladder order — the escalation path. */
export const LADDER: VerificationStage[] = VERIFICATION_STAGES.filter(
  (stage) => STAGES[stage].onDue.kind === 'remind',
)

/**
 * Days an event sits at a stage before the job advances it to the next.
 * Derived from the ladder's own transitions, so the admin stepper's date
 * projection can't drift from what the job actually does.
 */
export const STAGE_DURATION_DAYS: Record<string, number> = Object.fromEntries(
  LADDER.map((stage) => {
    const action = STAGES[stage].onDue
    return [stage, action.kind === 'remind' ? action.offsetDays : 0]
  }),
)

/**
 * Days from now until an unverified event at `stage` is unpublished — the sum
 * of the offsets up to the unpublish transition (`urgent → expired`). Every
 * reminder shows the same absolute unpublish date; once processing the
 * unpublish stage itself, it's 0 (unpublished today).
 *
 * Walks only `remind` actions, so it terminates on any other kind — a stage off
 * the ladder simply has nothing to count.
 */
export function daysUntilUnpublish(stage: VerificationStage): number {
  let total = 0
  let current: VerificationStage = stage
  const seen = new Set<VerificationStage>()
  while (!seen.has(current)) {
    seen.add(current)
    const action = STAGES[current]?.onDue
    if (action?.kind !== 'remind') break
    if (transitionUnpublishes(current)) break // this transition unpublishes — no further wait
    total += action.offsetDays
    current = action.nextStage
  }
  return total
}

/** The date an unverified event at `stage` is (or was) unpublished. */
export function unpublishDate(stage: VerificationStage, now: Date): Date {
  return addDays(now, daysUntilUnpublish(stage))
}
