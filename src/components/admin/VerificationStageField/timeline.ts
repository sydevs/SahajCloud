import { asNotificationLog } from '@/lib/eventVerification/log'
import {
  isPreAdoptionStage,
  LADDER,
  STAGE_DURATION_DAYS,
  type VerificationStage,
} from '@/lib/eventVerification/stages'
import { DAY_MS } from '@/lib/utilities/time'

/**
 * View model for the verification tracker: which steps to draw for an event,
 * what each one says, and the date to put against it.
 *
 * The tracker shows the **journey the event is on**, not a fixed list of
 * stages. There are three, and every stage belongs to exactly one:
 *
 * - **pre-adoption** (`unverified` → `denied` → `verified`) — a submitted or
 *   imported listing, what could take it down, and what it takes to adopt it.
 * - **managed** (`verified` → reminders → `expired`) — the re-verification
 *   cycle a manager owns.
 * - **finished** — a single terminal step; its schedule has run out.
 *
 * Three reminder stages collapse into one "Reminders" step because a manager
 * doesn't care which of the three reminders was last sent — only that the
 * event is being chased. That collapse is the *only* thing this file knows
 * that the stage config doesn't; everything else (which stages are
 * pre-adoption, the ladder order, each stage's dwell time) is imported from
 * `@/lib/eventVerification/stages` so the two can't drift.
 */


export type StepKey = 'unverified' | 'denied' | 'verified' | 'reminders' | 'expired' | 'finished'
export type StepStatus = 'done' | 'current' | 'upcoming'

/** The step each stage renders as. Exhaustive: a new stage is a compile error. */
const STAGE_STEP: Record<VerificationStage, StepKey> = {
  unverified: 'unverified',
  denied: 'denied',
  verified: 'verified',
  reminded: 'reminders',
  escalated: 'reminders',
  urgent: 'reminders',
  expired: 'expired',
  finished: 'finished',
}

const PRE_ADOPTION_STEPS: StepKey[] = ['unverified', 'denied', 'verified']
const MANAGED_STEPS: StepKey[] = ['verified', 'reminders', 'expired']

/** The steps to draw for an event at this stage. */
function journeyFor(stage: VerificationStage | null | undefined): StepKey[] {
  if (stage && isPreAdoptionStage(stage)) return PRE_ADOPTION_STEPS
  if (stage === 'finished') return ['finished']
  return MANAGED_STEPS
}

interface StepCopy {
  label: string
  caption: string
}

/**
 * Label + one-line caption for every step, tensed by status — `done` reads in
 * the past, `current` in the present, `upcoming` in the future.
 *
 * `verified.upcoming` is written for the pre-adoption journey, where it's the
 * destination and the reader needs to know what *they* must do to get there.
 * It can't collide with the managed journey, where `verified` is the first
 * step and so is never `upcoming`.
 */
const STEP_COPY: Record<StepKey, Record<StepStatus, StepCopy>> = {
  unverified: {
    done: {
      label: 'Submitted',
      caption: 'Was listed unverified until a manager took it on.',
    },
    current: {
      label: 'Unverified',
      caption:
        'Listed from an import or a public submission, and shown on the map as unverified. Attendees who register can confirm or deny that it really happens.',
    },
    upcoming: {
      label: 'Unverified',
      caption: 'Would be listed as unverified until a manager takes it on.',
    },
  },
  denied: {
    done: {
      label: 'Was Denied',
      caption: 'Attendees reported this event doesn’t exist, and it was restored afterwards.',
    },
    current: {
      label: 'Denied',
      caption:
        'Enough attendees reported this event doesn’t exist, so it was unpublished automatically. Assigning a manager restores it.',
    },
    upcoming: {
      label: 'Could Be Denied',
      caption:
        'If enough registered attendees report that this event doesn’t exist, it’s unpublished automatically.',
    },
  },
  verified: {
    done: { label: 'Last Verified', caption: 'Was confirmed accurate and publicly listed.' },
    current: { label: 'Last Verified', caption: 'Confirmed accurate and publicly listed.' },
    upcoming: {
      label: 'Verified',
      caption:
        'Assign a manager and save to adopt this event. That verifies it and starts the regular re-verification cycle.',
    },
  },
  reminders: {
    done: {
      label: 'Reminders Sent',
      caption: 'Managers were reminded to check and re-verify the event details.',
    },
    current: {
      label: 'Needs Verification',
      caption:
        'Managers are being reminded weekly to check and verify the event details are still accurate.',
    },
    upcoming: {
      label: 'Will Need Verification',
      caption:
        'Managers will be reminded weekly to check and verify the event details are still accurate.',
    },
  },
  expired: {
    done: {
      label: 'Expired',
      caption: 'Was unpublished and hidden from the public until re-verified.',
    },
    current: {
      label: 'Expired',
      caption: 'Unpublished and hidden from the public until the event is re-verified.',
    },
    upcoming: {
      label: 'Will Expire',
      caption: 'Will be unpublished and hidden from the public until the event is re-verified.',
    },
  },
  finished: {
    done: {
      label: 'Finished',
      caption: 'The event’s schedule has ended, so it’s no longer publicly listed.',
    },
    current: {
      label: 'Finished',
      caption: 'The event’s schedule has ended, so it’s no longer publicly listed.',
    },
    upcoming: {
      label: 'Finishes',
      caption: 'Will no longer be publicly listed once its schedule ends.',
    },
  },
}

export interface TrackerStep {
  key: StepKey
  label: string
  caption: string
  status: StepStatus
  /** ISO date to show, or null. */
  date: string | null
  /** Small qualifier before the date, e.g. `next reminder on` / `if not verified by`. */
  datePrefix?: string
}

export interface StageTracker {
  steps: TrackerStep[]
}

type Log = ReturnType<typeof asNotificationLog>

/**
 * Whether the schedule runs out at or before the next scheduled check — i.e.
 * this event finishes rather than reaching its next reminder. Both dates come
 * from the same watermark rule, so equality is the common case (the cap made
 * them the same date).
 */
function finishesBeforeNextCheck(
  scheduleEnd: string | null | undefined,
  nextCheckAt: string | null | undefined,
): boolean {
  if (!scheduleEnd || !nextCheckAt) return false
  const end = new Date(scheduleEnd).getTime()
  const next = new Date(nextCheckAt).getTime()
  if (Number.isNaN(end) || Number.isNaN(next)) return false
  return end <= next
}

/** ISO `at` of the cycle-opening verification entry. */
function verificationAt(log: Log): string | null {
  const entry = log.find((e) => e.kind === 'verification')
  return entry ? entry.at : null
}

/** Earliest reminder `at` logged at `fromStage` (when that stage advanced). */
function advancedFrom(log: Log, fromStage: string): string | null {
  const ats = log.filter((e) => e.kind === 'reminder' && e.stage === fromStage).map((e) => e.at)
  return ats.length ? ats.reduce((min, at) => (at < min ? at : min)) : null
}

/**
 * Projected date the event reaches `expired`: `nextCheckAt` (the current
 * stage's next advance) plus the dwell time of every ladder stage between the
 * next one and the end. Null when the stage is off the ladder or there's no
 * `nextCheckAt` to count from.
 */
function projectedExpiry(
  stage: VerificationStage,
  nextCheckAt: string | null | undefined,
): string | null {
  if (!nextCheckAt) return null
  const from = LADDER.indexOf(stage)
  if (from < 0) return null
  let ms = new Date(nextCheckAt).getTime()
  if (Number.isNaN(ms)) return null
  for (let j = from + 1; j < LADDER.length; j++)
    ms += (STAGE_DURATION_DAYS[LADDER[j]] ?? 0) * DAY_MS
  return new Date(ms).toISOString()
}

/**
 * Build the tracker for an event's current position in its lifecycle.
 *
 * On the managed journey: Verified shows the last-verified date; Reminders
 * (while current) shows the next reminder date; Expired shows the unpublish
 * date — actual once reached, else projected.
 */
export function buildStageTracker(args: {
  log: unknown
  currentStage: VerificationStage | null | undefined
  nextCheckAt: string | null | undefined
  /** The event's `updatedAt` — the date shown on a pre-adoption or finished step. */
  updatedAt?: string | null
  /** Derived end of the final occurrence, from `schedule.lastDate`. */
  scheduleEnd?: string | null
}): StageTracker {
  const log = asNotificationLog(args.log)
  const { currentStage, nextCheckAt, updatedAt, scheduleEnd } = args

  const steps = journeyFor(currentStage)
  const currentKey = currentStage ? STAGE_STEP[currentStage] : null
  const currentIndex = currentKey ? steps.indexOf(currentKey) : -1
  const verifiedDate = verificationAt(log)
  const expiredActual = advancedFrom(log, 'urgent') // when it entered `expired`

  // The schedule runs out before the next check is due, so the ladder never
  // gets there: `nextCheckAt` is the finish date, not a reminder date (see
  // `resolveNextCheckAt` — the watermark is capped by the schedule's end).
  // Drawing the ladder would label a finish date as a reminder and project an
  // expiry that will never happen.
  const finishesFirst = steps === MANAGED_STEPS && finishesBeforeNextCheck(scheduleEnd, nextCheckAt)

  const layout: StepKey[] = finishesFirst ? ['verified', 'finished'] : steps

  return {
    steps: layout.map((key, index) => {
      let status: StepStatus
      if (finishesFirst) {
        status = key === 'verified' ? (currentIndex === 0 ? 'current' : 'done') : 'upcoming'
      } else if (currentIndex < 0) status = 'upcoming'
      else if (index < currentIndex) status = 'done'
      else if (index === currentIndex) status = 'current'
      else status = 'upcoming'

      const copy = STEP_COPY[key][status]
      const { date, datePrefix } = stepDate({
        key,
        status,
        currentStage,
        nextCheckAt,
        updatedAt,
        scheduleEnd,
        verifiedDate,
        expiredActual,
        finishesFirst,
      })
      return { key, label: copy.label, caption: copy.caption, status, date, datePrefix }
    }),
  }
}

/** The date (and its qualifier) shown against one step. */
function stepDate(args: {
  key: StepKey
  status: StepStatus
  currentStage: VerificationStage | null | undefined
  nextCheckAt: string | null | undefined
  updatedAt?: string | null
  scheduleEnd?: string | null
  verifiedDate: string | null
  expiredActual: string | null
  finishesFirst: boolean
}): { date: string | null; datePrefix?: string } {
  const { key, status, currentStage, nextCheckAt, verifiedDate, expiredActual } = args

  switch (key) {
    case 'verified':
      return { date: verifiedDate }

    case 'finished':
      // Upcoming (the capped-watermark case) shows when it will finish;
      // current shows when it did.
      return status === 'upcoming'
        ? { date: args.scheduleEnd ?? null, datePrefix: 'on' }
        : { date: args.updatedAt ?? null }

    case 'reminders':
      if (status === 'current') return { date: nextCheckAt ?? null, datePrefix: 'next reminder on' }
      // While verified: when this event will first need re-verification.
      if (status === 'upcoming') return { date: nextCheckAt ?? null, datePrefix: 'on' }
      return { date: null }

    case 'expired':
      // Already expired — the actual unpublish date.
      if (status === 'current' && expiredActual) return { date: expiredActual, datePrefix: 'on' }
      if (!currentStage) return { date: null }
      // Not yet expired — the projected date if it isn't re-verified first.
      const projected = projectedExpiry(currentStage, nextCheckAt)
      return projected ? { date: projected, datePrefix: 'if not verified by' } : { date: null }

    // Pre-adoption steps turn on an editor's action, not a date. Only the one
    // the event is actually sitting at gets a timestamp.
    case 'unverified':
    case 'denied':
      return status === 'current' ? { date: args.updatedAt ?? null } : { date: null }
  }
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** Compact, words date for a step, e.g. `13 Jun 2026`. */
export function formatStageDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return DATE_FORMAT.format(date)
}
