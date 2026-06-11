import { addDays } from '@/lib/eventVerification/periods'
import type { VerificationStage } from '@/lib/eventVerification/stages'
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
 * Reminder ladder. Offsets mirror Atlas's ~2wk-to-expire / ~2wk-to-archive
 * spread: 1wk to escalate to region, 1wk to the final notice, then a 2wk grace
 * before trashing. The dedup key for a stage's sends is the *current* (from)
 * stage, so advancing never re-sends.
 */
const TRANSITIONS: Record<'verified' | 'reminded' | 'escalated' | 'expired', StageTransition> = {
  verified: {
    level: 'due',
    includeRegion: false,
    nextStage: 'reminded',
    offsetDays: 7,
    unpublish: false,
  },
  reminded: {
    level: 'escalated',
    includeRegion: true,
    nextStage: 'escalated',
    offsetDays: 7,
    unpublish: false,
  },
  escalated: {
    level: 'expired',
    includeRegion: true,
    nextStage: 'expired',
    offsetDays: 14,
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

/** Minimal shape the finished-check reads off an event. */
export interface FinishCheckInput {
  inactive?: boolean | null
  schedule?: { firstDate?: string | null; upcomingDates?: unknown } | null
}

/**
 * Whether a due event should be marked `finished` (Atlas `should_finish?`):
 * it has a schedule, is NOT inactive, and the schedule has no upcoming dates.
 * The `!inactive` + has-schedule guards are essential — without them every
 * inactive or scheduleless event would falsely "finish".
 */
export function shouldFinish(event: FinishCheckInput): boolean {
  if (event.inactive) return false
  const schedule = event.schedule
  if (!schedule?.firstDate) return false
  const upcoming = schedule.upcomingDates
  return Array.isArray(upcoming) && upcoming.length === 0
}
