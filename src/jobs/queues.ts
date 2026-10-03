import type { JobsConfig } from 'payload'

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

type AutoRunEntry = Extract<NonNullable<JobsConfig['autoRun']>, unknown[]>[number]

/**
 * `jobs.autoRun` — one entry per queue that runs unattended.
 *
 * ⚠ A cron here has to tick far more often than the schedules on its queue,
 * because the tick is both halves of the cycle: it enqueues a due schedule with
 * `waitUntil` at the next occurrence, and a *later* tick is what runs that row.
 * The tick interval, not the schedule, is the worst-case lateness.
 *
 * ⚠ Stagger the minute. Every tick rewrites the whole `payload-jobs-stats`
 * global from the snapshot it read, so two queues ticking together lose one
 * queue's `lastScheduledRun` to the other's write.
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
    // Hourly, not daily, for schedules that fire on the 1st of the month: a
    // tick missed to a deploy then costs an hour rather than a day. :07 is the
    // stagger — `screening` fires on every 15th minute and `invitations` on
    // every 5th, so any multiple of 5 collides with one of them hourly.
    cron: '7 * * * *',
    queue: 'monthly',
  },
]

/**
 * Queues a schedule may name with no `autoRun` entry, each with the reason
 * nothing may start it. An unlisted one is a dead schedule, not a decision.
 *
 * Empty today. It is the exemption the dead-schedule guard reads, so the next
 * queue deliberately left undriven is one entry here rather than an edit to
 * `tests/unit/job-schedules.spec.ts`.
 */
export const UNSCHEDULED_QUEUES: Record<string, string> = {}
