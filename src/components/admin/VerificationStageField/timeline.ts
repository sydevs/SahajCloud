import { asNotificationLog } from '@/lib/eventVerification/log'
import {
  STAGE_DURATION_DAYS,
  VERIFICATION_STAGES,
  type VerificationStage,
} from '@/lib/eventVerification/stages'

/**
 * Internal 5-stage journey, used only for date math. The UI collapses the three
 * reminder stages into one "Reminders" step (see STEP_ORDER).
 */
const JOURNEY = VERIFICATION_STAGES.filter((stage) => stage !== 'finished') as Exclude<
  VerificationStage,
  'finished'
>[] // verified · reminded · escalated · urgent · expired

const EXPIRED_INDEX = JOURNEY.indexOf('expired')
const DAY_MS = 24 * 60 * 60 * 1000

/** `finished` is rendered as a standalone terminal step, not part of the journey. */
export type StepKey = 'verified' | 'reminders' | 'expired' | 'finished'
type JourneyKey = Exclude<StepKey, 'finished'>
export type StepStatus = 'done' | 'current' | 'upcoming'

const STEP_ORDER: JourneyKey[] = ['verified', 'reminders', 'expired']

interface StepCopy {
  label: string
  caption: string
}

/**
 * Label + one-line caption for every step, tensed by status — `done` reads in
 * the past, `current` in the present, `upcoming` in the future. The component
 * looks up `STEP_COPY[key][status]`; `finished` is rendered as `current`.
 */
const STEP_COPY: Record<StepKey, Record<StepStatus, StepCopy>> = {
  verified: {
    done: { label: 'Last Verified', caption: 'Was confirmed accurate and publicly listed.' },
    current: { label: 'Last Verified', caption: 'Confirmed accurate and publicly listed.' },
    upcoming: { label: 'Verification', caption: 'Will be confirmed accurate and publicly listed.' },
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

/** Which display step a raw stage belongs to (`null` for finished/unknown). */
function stepForStage(stage: VerificationStage | null | undefined): JourneyKey | null {
  if (stage === 'verified') return 'verified'
  if (stage === 'reminded' || stage === 'escalated' || stage === 'urgent') return 'reminders'
  if (stage === 'expired') return 'expired'
  return null
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
 * Projected date the event reaches `expired`: `nextCheckAt` (the current stage's
 * next advance) plus the durations of the stages between the next one and
 * expired. Null when already expired or no `nextCheckAt`.
 */
function projectedExpiry(
  stage: VerificationStage,
  nextCheckAt: string | null | undefined,
): string | null {
  if (!nextCheckAt) return null
  const from = JOURNEY.indexOf(stage as Exclude<VerificationStage, 'finished'>)
  if (from < 0 || from >= EXPIRED_INDEX) return null
  let ms = new Date(nextCheckAt).getTime()
  if (Number.isNaN(ms)) return null
  // j never reaches EXPIRED_INDEX, so JOURNEY[j] is always a duration-bearing stage.
  for (let j = from + 1; j < EXPIRED_INDEX; j++)
    ms += (STAGE_DURATION_DAYS[JOURNEY[j] as keyof typeof STAGE_DURATION_DAYS] ?? 0) * DAY_MS
  return new Date(ms).toISOString()
}

/**
 * Build the 3-step verification tracker for an event's current cycle. Verified
 * shows the last-verified date; Reminders (while current) shows the next reminder
 * date; Expired shows the unpublish date — actual once reached, else a projected
 * estimate. `finished` is flagged separately (off the escalation path).
 */
export function buildStageTracker(args: {
  log: unknown
  currentStage: VerificationStage | null | undefined
  nextCheckAt: string | null | undefined
  /** The event's `updatedAt` — used as the "Finished" date. */
  updatedAt?: string | null
}): StageTracker {
  const log = asNotificationLog(args.log)
  const { currentStage, nextCheckAt, updatedAt } = args

  // Finished is off the escalation path: a single terminal step (styled like a
  // completed stage) rather than the full journey.
  if (currentStage === 'finished') {
    return {
      steps: [
        {
          key: 'finished',
          label: STEP_COPY.finished.current.label,
          caption: STEP_COPY.finished.current.caption,
          status: 'current',
          date: updatedAt ?? null,
        },
      ],
    }
  }

  const currentKey = stepForStage(currentStage)
  const currentIndex = currentKey ? STEP_ORDER.indexOf(currentKey) : -1
  const verifiedDate = verificationAt(log)
  const expiredActual = advancedFrom(log, 'urgent') // when it entered `expired`

  const steps: TrackerStep[] = STEP_ORDER.map((key, index) => {
    let status: StepStatus
    if (currentIndex < 0) status = 'upcoming'
    else if (index < currentIndex) status = 'done'
    else if (index === currentIndex) status = 'current'
    else status = 'upcoming'

    let date: string | null = null
    let datePrefix: string | undefined

    if (key === 'verified') {
      date = verifiedDate
    } else if (key === 'reminders') {
      if (status === 'current') {
        date = nextCheckAt ?? null
        datePrefix = 'next reminder on'
      } else if (status === 'upcoming') {
        // While verified: when this event will first need re-verification.
        date = nextCheckAt ?? null
        datePrefix = 'on'
      }
    } else if (status === 'current' && expiredActual) {
      // already expired — the actual unpublish date
      date = expiredActual
      datePrefix = 'on'
    } else if (currentStage) {
      // not yet expired — the projected date if it isn't re-verified first
      date = projectedExpiry(currentStage, nextCheckAt)
      if (date) datePrefix = 'if not verified by'
    }

    const copy = STEP_COPY[key][status]
    return {
      key,
      label: copy.label,
      caption: copy.caption,
      status,
      date,
      datePrefix,
    }
  })

  return { steps }
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
