import { addDays } from '@/lib/eventVerification/periods'
import { STAGE_DURATION_DAYS, type VerificationStage } from '@/lib/eventVerification/stages'
import type { ReminderLevel } from '@/lib/notifications'

/** What to do when a due event at a given stage is processed. */
export interface StageTransition {
  /** Reminder copy level, or `null` for the no-email terminal (trash). */
  level: ReminderLevel | null
  /** Whether to escalate to ancestor-region managers this stage. */
  includeRegion: boolean
  /** Stage to move to, or `'trash'` to soft-delete the event. */
  nextStage: VerificationStage | 'trash'
  /** Days until the next check (`null` = terminal, clears `nextCheckAt`). */
  offsetDays: number | null
  /** Unpublish (`_status: 'draft'`) on this transition. */
  unpublish: boolean
}

/**
 * Reminder ladder. The four reminders are due → escalated → urgent (final),
 * each 1wk apart, then a 2wk grace before unpublishing, then 2wk before
 * trashing. Region managers are looped in from `escalated` onward. The dedup
 * key for a stage's sends is the *current* (from) stage, so advancing never
 * re-sends.
 */
const TRANSITIONS: Record<
  'verified' | 'reminded' | 'escalated' | 'urgent' | 'expired',
  StageTransition
> = {
  verified: {
    level: 'due',
    includeRegion: false,
    nextStage: 'reminded',
    offsetDays: STAGE_DURATION_DAYS.verified,
    unpublish: false,
  },
  reminded: {
    level: 'escalated',
    includeRegion: true,
    nextStage: 'escalated',
    offsetDays: STAGE_DURATION_DAYS.reminded,
    unpublish: false,
  },
  escalated: {
    level: 'urgent',
    includeRegion: true,
    nextStage: 'urgent',
    offsetDays: STAGE_DURATION_DAYS.escalated,
    unpublish: false,
  },
  urgent: {
    level: 'expired',
    includeRegion: true,
    nextStage: 'expired',
    offsetDays: STAGE_DURATION_DAYS.urgent,
    unpublish: true,
  },
  expired: {
    level: null,
    includeRegion: false,
    nextStage: 'trash',
    offsetDays: null,
    unpublish: false,
  },
}

/** The transition for a stage, or `null` for terminal/unknown stages. */
export function nextStageTransition(stage: VerificationStage): StageTransition | null {
  return TRANSITIONS[stage as keyof typeof TRANSITIONS] ?? null
}

/** `nextCheckAt` for a transition (null when terminal). */
export function computeNextCheckAt(transition: StageTransition, now: Date): string | null {
  return transition.offsetDays == null ? null : addDays(now, transition.offsetDays).toISOString()
}

/**
 * Days from now until an unverified event at `stage` is unpublished — the sum
 * of the offsets up to the unpublish transition (`urgent → expired`). Every
 * reminder shows the same absolute unpublish date; once processing the
 * unpublish stage itself, it's 0 (unpublished today).
 */
export function daysUntilUnpublish(stage: VerificationStage): number {
  let total = 0
  let current: VerificationStage | 'trash' = stage
  const seen = new Set<string>()
  while (current !== 'trash' && !seen.has(current)) {
    seen.add(current)
    const transition: StageTransition | undefined = TRANSITIONS[current as keyof typeof TRANSITIONS]
    if (!transition) break
    if (transition.unpublish) break // processing this stage unpublishes — no further wait
    total += transition.offsetDays ?? 0
    current = transition.nextStage
  }
  return total
}

/** The date an unverified event at `stage` is (or was) unpublished. */
export function unpublishDate(stage: VerificationStage, now: Date): Date {
  return addDays(now, daysUntilUnpublish(stage))
}
