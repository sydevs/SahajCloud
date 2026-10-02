
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { tasks } from '@/jobs'
import { JOB_AUTO_RUN, MANUAL_QUEUE, UNSCHEDULED_QUEUES } from '@/jobs/queues'
import { INVITATIONS_QUEUE, sendInvitationsTask } from '@/plugins/login/invitations'
import type { LoginCollectionConfig } from '@/plugins/login/types'
import { resetUsageTask } from '@/plugins/usage'

import { sourceFiles, sourceOf, SRC } from '../utils/importGraph'

/**
 * Every queue a task schedules onto either runs unattended or says why it does
 * not.
 *
 * ⚠ The failure this pins leaves no trace at all. A `schedule` enqueues nothing
 * by itself: Payload calls `handleSchedules({ queue })` only from an `autoRun`
 * cron for that same queue. So a schedule on a queue with no entry is simply
 * never consulted — no error, no log line, no job row. `monthly` was in that
 * state for about ten months, and #715 fixed a crash on a path that had never
 * run (#878).
 */

/**
 * Every task Payload ends up with a schedule for — `src/jobs/index.ts`'s own,
 * plus the two a plugin appends to `jobs.tasks`.
 *
 * ⚠ The plugin pair is the half that matters here. `tasks` alone is what the
 * first version of this spec read, which left the seam #878 came through
 * unguarded: a plugin task scheduling onto a dead queue would have passed. The
 * sweep below is what makes a third one impossible to forget.
 */
const SCHEDULED_TASKS: { schedule?: { queue?: string }[]; slug: string }[] = [
  ...tasks,
  resetUsageTask,
  // The factory reads nothing off its argument to build `schedule`.
  sendInvitationsTask({} as LoginCollectionConfig),
]

/** Queues driven by a plugin's own `autoRun` append rather than `JOB_AUTO_RUN`. */
const PLUGIN_AUTO_RUN_QUEUES = [INVITATIONS_QUEUE]

function autoRunQueues(): Set<string> {
  return new Set([
    ...JOB_AUTO_RUN.map((entry) => entry.queue ?? 'default'),
    ...PLUGIN_AUTO_RUN_QUEUES,
  ])
}

describe('Job schedules', () => {
  it('runs or excuses every queue a task schedules onto', () => {
    const driven = autoRunQueues()

    const dead = SCHEDULED_TASKS.flatMap((task) =>
      (task.schedule ?? []).map((entry) => [entry.queue ?? 'default', task.slug] as const),
    )
      .filter(([queue]) => !driven.has(queue) && !(queue in UNSCHEDULED_QUEUES))
      .map(([queue, slug]) => `${queue} (${slug})`)

    expect(dead).toEqual([])
  })

  /**
   * An `allQueues` entry runs everything, which would make the assertion above
   * pass for any queue at all. Payload also ignores `queue` when it is set, so
   * the entry would be a silent override rather than an addition.
   */
  it('names a queue on every autoRun entry', () => {
    for (const entry of JOB_AUTO_RUN) {
      expect(entry.allQueues ?? false).toBe(false)
      expect(entry.queue).toBeTruthy()
    }
  })

  /**
   * Excusing a queue that something ticks is worse than forgetting one: the
   * reason would read as protection while the job runs anyway.
   */
  it('excuses no queue that an autoRun entry drives', () => {
    for (const queue of Object.keys(UNSCHEDULED_QUEUES)) {
      expect([...autoRunQueues()]).not.toContain(queue)
    }
  })

  /**
   * ⚠ Every tick rewrites the whole `payload-jobs-stats` global from the
   * snapshot it read, so two queues ticking on the same minute lose one's
   * `lastScheduledRun` to the other's write.
   */
  it('gives each queue its own minute', () => {
    const minutes = JOB_AUTO_RUN.map((entry) => entry.cron?.split(' ')[0])
    expect(new Set(minutes).size).toBe(minutes.length)
  })

  it('keeps CleanupOrphanedMedia off every queue that ticks', () => {
    const cleanup = tasks.find((task) => task.slug === 'cleanupOrphanedMedia')
    expect(cleanup?.schedule?.map((entry) => entry.queue)).toEqual([MANUAL_QUEUE])
  })

  /**
   * The assertions above read `JOB_AUTO_RUN`, so they are worth nothing unless
   * the config is what hands it to Payload. Checked as source text because
   * importing `payload.config.ts` would build the whole config.
   */
  it('is the array the config passes to Payload', () => {
    expect(sourceOf(join(SRC, 'payload.config.ts'))).toContain('autoRun: JOB_AUTO_RUN')
  })

  /**
   * ⚠ `SCHEDULED_TASKS` is a hand-written list, so this is what makes an
   * omission loud: a new `schedule:` anywhere under `src/` fails here until it
   * is added above. Without it the spec silently stops covering the file.
   */
  it('scans every file under src/ that declares a schedule', () => {
    const declaring = sourceFiles(SRC)
      .filter((file) => sourceOf(file).includes('schedule: ['))
      .map((file) => relative(SRC, file))
      .sort()

    expect(declaring).toEqual([
      'jobs/CleanupOrphanedMedia/CleanupOrphanedMedia.ts',
      'jobs/ExpireEvents/ExpireEvents.ts',
      'jobs/PurgeSubmissions/PurgeSubmissions.ts',
      'jobs/RegistrationNotifications/SendPostEventFollowUps.ts',
      'jobs/RegistrationNotifications/SendRegistrationDigests.ts',
      'jobs/RegistrationNotifications/SendSessionReminders.ts',
      'jobs/SyncLectureMetadata/SyncLectureMetadata.ts',
      'jobs/VerifyEmbeds/VerifyEmbeds.ts',
      'plugins/login/invitations.ts',
      'plugins/usage/tasks.ts',
    ])
  })
})
