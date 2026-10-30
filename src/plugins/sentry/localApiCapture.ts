/**
 * Reporting a Local API write the admin makes outside a Payload route.
 *
 * `DocumentView` catches a failed render inside `node_modules` and answers 200
 * with an empty body; `schedulePublishHandler` catches and returns `{ error }`.
 * Nothing escapes to `onRequestError`, so the Local API call itself is the only
 * seam left (#1038, #1039). The publish a schedule later runs fails inside the
 * job runner instead — `installScheduledPublishCapture` covers that one.
 *
 * ⚠ **The wrapper rethrows, always.** It observes; it must not change what any
 * caller sees.
 */
import type { Payload, PayloadRequest } from 'payload'

import { isRecord } from '@/lib/utilities/isRecord'

import { captureFailure } from './captureFailure'

/** What a `schedulePublish` input is for: `pages/12`, or a global's slug. */
const scheduledTarget = (input: unknown): string | undefined => {
  if (!isRecord(input)) return undefined
  const { doc, global } = input
  if (isRecord(doc) && typeof doc.relationTo === 'string') {
    return `${doc.relationTo}/${String(doc.value)}`
  }
  return typeof global === 'string' ? global : undefined
}

/** Who queued a `schedulePublish` — the input records it as a relationship. */
const scheduledBy = (input: unknown): { id: string } | undefined =>
  isRecord(input) && isRecord(input.user) && input.user.value != null
    ? { id: String(input.user.value) }
    : undefined

const report = (error: unknown, options: unknown, row?: string): void => {
  const { collection, input, req, slug } = isRecord(options) ? options : {}
  const request = req as PayloadRequest | undefined

  // Save, Publish and autosave submit to the REST API, where `afterError`
  // reports. `createLocalReq` **preserves** the `REST`/`GraphQL` stamp through
  // a nested Local API call, so a write our hooks make mid-request stands down
  // too. The admin page render and server functions read `local`.
  // `tests/int/admin-write-capture.int.spec.ts` pins the preservation.
  if (request && request.payloadAPI !== 'local') return

  // ⚠ **`schedulePublishHandler` queues with no `req` at all**, so its acting
  // manager comes from the queued input, where `schedulePublish` records it.
  const queuedBy = request ? undefined : scheduledBy(input)

  // An acting manager on the request. A job, a cron tick, a seed and a script
  // carry none, and `eventImport` passes `user` with no request — its refused
  // rows are reported to the uploader already. Only a queue reports without one.
  if (request ? !request.user : !row) return

  captureFailure({
    // `collection` for a document write, `slug` for a global, the jobs row for a queue.
    collection: [collection, slug, row].find((value) => typeof value === 'string') as
      string | undefined,
    error,
    req: request,
    source: 'localApi',
    target: row ? scheduledTarget(input) : undefined,
    user: queuedBy,
  })
}

/**
 * Wrap every Local API write on a live Payload instance.
 *
 * ⚠ **`jobs.queue` needs wrapping too.** It writes through `payload.db.create`
 * unless `jobs.depth` or `jobs.runHooks` is configured, so the collection
 * operations do not reach it — and it is half of `schedule-publish` (#1039).
 */
export const installLocalApiCapture = (payload: Payload): void => {
  const wrap = <Target extends object, Key extends keyof Target>(
    target: Target,
    key: Key,
    row?: string,
  ) => {
    // `.bind`: `delete` and `update` are prototype methods that read `this`.
    const original = (target[key] as (options: unknown) => Promise<unknown>).bind(target)
    target[key] = (async (options: unknown) => {
      try {
        return await original(options)
      } catch (error) {
        report(error, options, row)
        throw error
      }
    }) as Target[Key]
  }

  for (const key of ['create', 'delete', 'duplicate', 'update', 'updateGlobal'] as const) {
    wrap(payload, key)
  }
  wrap(payload.jobs, 'queue', 'payload-jobs')
}

/**
 * Report a scheduled publish that fails when its job runs. The runner records
 * the throw on the job row and a log line alone, and the task's `payload.update`
 * carries no request, so the write wrapper above stands down for it.
 *
 * Only Payload's own `schedulePublish` is wrapped. Payload has no final-failure
 * hook that carries the error — `onFail` gets none, and runs on every attempt —
 * so a handler wrapper reports once per attempt, and only this task, with no
 * `retries`, makes that one event per job.
 *
 * ⚠ **The runner reads the handler off the live config**, which a dev HMR
 * `reload()` replaces without running `onInit`, so in dev the wrap lasts until
 * the first reload.
 *
 * ⚠ **No `req` is passed.** The runner's request carries the default locale and
 * a placeholder URL, and on `/api/payload-jobs/run` it is the admin who
 * triggered the run, not the manager who scheduled it.
 */
export const installScheduledPublishCapture = (payload: Payload): void => {
  const task = payload.config.jobs?.tasks?.find(({ slug }) => slug === 'schedulePublish')
  if (!task || typeof task.handler !== 'function') return
  const handler = task.handler
  task.handler = async (args) => {
    try {
      return await handler(args)
    } catch (error) {
      const { doc, global } = isRecord(args.input) ? args.input : {}
      captureFailure({
        collection: isRecord(doc) ? String(doc.relationTo) : (global as string | undefined),
        error,
        source: 'job',
        target: scheduledTarget(args.input),
        user: scheduledBy(args.input),
      })
      throw error
    }
  }
}
