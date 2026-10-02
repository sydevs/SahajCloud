import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { tasks } from '@/jobs'
import { JOB_AUTO_RUN, MANUAL_QUEUE, UNSCHEDULED_QUEUES } from '@/jobs/queues'
import { INVITATIONS_QUEUE } from '@/plugins/login/invitations'

import { sourceOf, SRC } from '../utils/importGraph'

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

/** Queues contributed by a plugin rather than by `JOB_AUTO_RUN`. */
const PLUGIN_AUTO_RUN_QUEUES = new Map([[INVITATIONS_QUEUE, 'loginPlugin, when invites are on']])

function scheduledQueues(): Map<string, string[]> {
  const queues = new Map<string, string[]>()
  for (const task of tasks) {
    for (const entry of task.schedule ?? []) {
      const queue = entry.queue ?? 'default'
      queues.set(queue, [...(queues.get(queue) ?? []), task.slug])
    }
  }
  return queues
}

describe('Job schedules', () => {
  it('runs or excuses every queue a task schedules onto', () => {
    const autoRun = new Set([
      ...JOB_AUTO_RUN.map((entry) => entry.queue ?? 'default'),
      ...PLUGIN_AUTO_RUN_QUEUES.keys(),
    ])

    const dead = [...scheduledQueues()]
      .filter(([queue]) => !autoRun.has(queue) && !(queue in UNSCHEDULED_QUEUES))
      .map(([queue, slugs]) => `${queue} (${slugs.join(', ')})`)

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
   * reason reads as protection while the job runs anyway.
   */
  it('excuses no queue that an autoRun entry drives', () => {
    for (const queue of Object.keys(UNSCHEDULED_QUEUES)) {
      expect(JOB_AUTO_RUN.map((entry) => entry.queue)).not.toContain(queue)
      expect([...PLUGIN_AUTO_RUN_QUEUES.keys()]).not.toContain(queue)
      expect(UNSCHEDULED_QUEUES[queue]).toMatch(/\S/)
    }
  })

  it('keeps CleanupOrphanedMedia off every queue that ticks', () => {
    const cleanup = tasks.find((task) => task.slug === 'cleanupOrphanedMedia')
    expect(cleanup?.schedule?.map((entry) => entry.queue)).toEqual([MANUAL_QUEUE])
    expect(MANUAL_QUEUE in UNSCHEDULED_QUEUES).toBe(true)
  })

  /**
   * The assertions above read `JOB_AUTO_RUN`, so they are worth nothing unless
   * the config is what hands it to Payload. The import is checked as source
   * text because importing `payload.config.ts` would build the whole config.
   */
  it('is the array the config passes to Payload', () => {
    const config = sourceOf(join(SRC, 'payload.config.ts'))
    expect(config).toContain('autoRun: JOB_AUTO_RUN')
    expect(config).toContain("import { JOB_AUTO_RUN } from './jobs/queues'")
  })

  /**
   * Same argument for the one entry a plugin appends instead. Read from the
   * append onward rather than matched whole, so reordering the entry's own
   * properties does not fail a spec about which queue it names.
   */
  it('is the queue loginPlugin appends an autoRun entry for', () => {
    const plugin = sourceOf(join(SRC, 'plugins/login/loginPlugin.ts'))
    const append = plugin.slice(plugin.indexOf('...config.jobs.autoRun'))
    expect(append).toContain('queue: INVITATIONS_QUEUE')
    expect(append).toContain('cron: INVITATIONS_CRON')
  })
})
