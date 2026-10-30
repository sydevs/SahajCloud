/**
 * Reporting a Local API write the admin makes outside a Payload route.
 *
 * `DocumentView` catches a failed render inside `node_modules` and answers 200
 * with an empty body; `schedulePublishHandler` catches and returns `{ error }`.
 * Nothing escapes to `onRequestError`, so the Local API call itself is the only
 * seam left (#1038, #1039).
 *
 * ⚠ **The wrapper rethrows, always.** It observes; it must not change what any
 * caller sees.
 */
import type { Payload, PayloadRequest } from 'payload'

import { isRecord } from '@/lib/utilities/isRecord'

import { captureFailure } from './captureFailure'

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
  const queuedBy =
    !request && isRecord(input) && isRecord(input.user) ? input.user.value : undefined

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
    user: queuedBy === undefined ? undefined : { id: String(queuedBy) },
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
