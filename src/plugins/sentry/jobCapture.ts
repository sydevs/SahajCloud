/**
 * Reporting a job run that fails for good (#1039).
 *
 * The job runner catches a task's throw, records it on the job row and a log
 * line, and tells no one — so a scheduled publish that never happened, or a
 * cleanup that stopped running, was visible only in the deploy log. Every task
 * handler is wrapped, Payload's own `schedulePublish` included.
 *
 * ⚠ **The runner reads each handler off the live config**, which a dev HMR
 * `reload()` replaces without running `onInit`, so in dev the wrap lasts until
 * the first reload.
 */
import type { Payload, TaskConfig } from 'payload'

import { JobCancelledError } from 'payload'

import { isRecord } from '@/lib/utilities/isRecord'

import { captureFailure } from './captureFailure'

/** What a `schedulePublish` input is for: `pages/12`, or a global's slug. */
export const scheduledTarget = (input: unknown): string | undefined => {
  if (!isRecord(input)) return undefined
  const { doc, global } = input
  if (isRecord(doc) && typeof doc.relationTo === 'string') {
    return `${doc.relationTo}/${String(doc.value)}`
  }
  return typeof global === 'string' ? global : undefined
}

/** Who queued a `schedulePublish` — the input records it as a relationship. */
export const scheduledBy = (input: unknown): { id: string } | undefined =>
  isRecord(input) && isRecord(input.user) && input.user.value != null
    ? { id: String(input.user.value) }
    : undefined

/**
 * Whether this failure is the job's last: the runner's own rule for a
 * single-task job, which runs the task as id `'1'` and retries it until its
 * prior tries reach the task's `retries` (none by default). A workflow job is
 * never judged final here — its own `retries` decide too, which the handler
 * cannot see, and none is configured.
 */
const isFinalAttempt = (task: TaskConfig, job: unknown): boolean => {
  if (!isRecord(job) || job.taskSlug !== task.slug) return false
  const { retries } = task
  const attempts = typeof retries === 'number' ? retries : (retries?.attempts ?? 0)
  const status = isRecord(job.taskStatus) ? job.taskStatus[task.slug] : undefined
  const prior = isRecord(status) && isRecord(status['1']) ? Number(status['1'].totalTried ?? 0) : 0
  return prior >= attempts
}

/**
 * Report a job's final failed attempt. Payload has no final-failure hook that
 * carries the error — `onFail` gets none, and runs on every attempt — so the
 * handler wrap judges the last attempt itself (`isFinalAttempt`). A manual
 * `runByID` of a job that already failed for good runs, and reports, again.
 *
 * ⚠ **No `req` is passed.** The runner's request carries the default locale and
 * a placeholder URL, and on `/api/payload-jobs/run` it is the admin who
 * triggered the run, not anyone the job acts for.
 */
export const installJobCapture = (payload: Payload): void => {
  for (const task of payload.config.jobs?.tasks ?? []) {
    if (typeof task.handler !== 'function') continue
    const handler = task.handler
    task.handler = async (args) => {
      try {
        return await handler(args)
      } catch (error) {
        if (!(error instanceof JobCancelledError) && isFinalAttempt(task, args.job)) {
          // Only `schedulePublish`'s input names a target and a person; no other
          // task's input reaches the event.
          const scheduled = task.slug === 'schedulePublish'
          const target = scheduled ? scheduledTarget(args.input) : undefined
          captureFailure({
            collection: target?.split('/')[0],
            error,
            job: { id: String(args.job.id), task: task.slug },
            source: 'job',
            target,
            user: scheduled ? scheduledBy(args.input) : undefined,
          })
        }
        throw error
      }
    }
  }
}
