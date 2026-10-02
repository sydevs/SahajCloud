import type { Config } from 'payload'

/**
 * Queue names and the `autoRun` entries that drive them.
 *
 * ⚠ A task `schedule` only enqueues, and only while an `autoRun` cron for **its
 * own** queue ticks: Payload calls `handleSchedules({ queue })` from that cron
 * and nowhere else. So a queue named by a schedule with no `autoRun` entry is a
 * dead schedule. `monthly` was one for about ten months, and neither job on it
 * had ever run in any environment (#878). `tests/unit/job-schedules.spec.ts`
 * fails on the next one.
 */

type AutoRunEntry = Extract<NonNullable<NonNullable<Config['jobs']>['autoRun']>, unknown[]>[number]

/**
 * Queue for a task that is scheduled but must never start by itself. Nothing
 * ticks it, so it runs only via `pnpm payload jobs:run --queue manual`.
 */
export const MANUAL_QUEUE = 'manual'

/**
 * `jobs.autoRun` — one entry per queue that runs unattended.
 *
 * ⚠ A cron here has to tick far more often than the schedules on its queue,
 * because the tick is both halves of the cycle: it enqueues a due schedule with
 * `waitUntil` at the next occurrence, and a *later* tick is what runs that row.
 * The tick interval, not the schedule, is the worst-case lateness.
 *
 * `loginPlugin` appends the `invitations` entry, so this is not the whole set at
 * runtime (`src/plugins/login/invitations.ts`).
 */
export const JOB_AUTO_RUN: AutoRunEntry[] = [
  {
    cron: '0 * * * *', // Runs every hour
    queue: 'nightly',
  },
  {
    // Safety net for the per-submission screening kick (see
    // UserSubmissions/hooks/enqueueSubmissionScreening): a submission whose
    // immediate run was lost to a crash waits at most 15 minutes.
    cron: '*/15 * * * *',
    queue: 'screening',
  },
  {
    // Hourly, for a schedule that fires on the 1st at 03:00 — see the lateness
    // note above. Only SyncLectureMetadata runs here; it reads the Nirmala Vidya
    // API and writes `lectures.metadata`.
    cron: '0 * * * *',
    queue: 'monthly',
  },
]

/**
 * Queues a schedule may name with no `autoRun` entry, each with the reason
 * nothing may start it. An unlisted one is a dead schedule, not a decision.
 */
export const UNSCHEDULED_QUEUES: Record<string, string> = {
  [MANUAL_QUEUE]:
    'CleanupOrphanedMedia: Phase A permanently deletes everything already in the media trash with no age check, including what an editor trashed by hand. It needs an age threshold and a dry run reviewed against production before it may run unattended (#878).',
}
