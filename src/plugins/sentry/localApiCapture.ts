/**
 * Reporting a Local API write the admin makes outside a Payload route.
 *
 * `DocumentView` wraps its whole render in a `try/catch`, hands the error to
 * Payload's `logError` and returns `undefined` — the page answers 200 with the
 * admin chrome and an empty body, and nothing escapes to `onRequestError`.
 * `schedulePublishHandler` catches the same way and returns `{ error }` to the
 * UI. Both are caught inside `node_modules`, upstream of any component we can
 * supply, so the Local API call itself is the only seam left. That blind spot
 * is how #1038 — nobody could create a Page at all — stood for four months
 * (#1039).
 *
 * Two properties of the request keep this to writes the admin makes. Both are
 * read off the request Payload itself built — nothing here infers anything from
 * a clock or a call stack.
 *
 * ⚠ **The wrapper rethrows, always.** It observes; it must not change what any
 * caller sees.
 */
import type { Payload, PayloadRequest } from 'payload'

import { isRecord } from '@/lib/utilities/isRecord'

import { captureFailure, type SentryContextFn } from './captureFailure'

const report = (error: unknown, options: unknown, context?: SentryContextFn): void => {
  const { collection, req, slug } = isRecord(options) ? options : {}
  const request = req as PayloadRequest | undefined

  // Save, Publish and the periodic autosave submit to the REST API, where
  // `routeError` already reports through `afterError`. `createPayloadRequest`
  // stamps such a request `REST` or `GraphQL`, and `createLocalReq` **preserves
  // that stamp** through a nested Local API call — so a write our own hooks
  // make while a request is in flight reads as routed and stands down, rather
  // than reporting what the hook is about to report.
  //
  // The admin page render and every admin server function build their request
  // through `initReq`, which goes through `createLocalReq`, so both read
  // `local`. `tests/int/admin-write-capture.int.spec.ts` pins the preservation.
  if (request?.payloadAPI !== 'local') return

  // An acting manager **on the request**. A job, a seed and an operator script
  // carry no user; `eventImport`'s task passes a `user` option with no request
  // at all, and a refused CSV row is reported to its uploader already.
  if (!request.user) return

  captureFailure({
    // `collection` for a document write, `slug` for a global one.
    collection:
      typeof collection === 'string' ? collection : typeof slug === 'string' ? slug : undefined,
    context,
    error,
    // A `ValidationError` answers 400 on a route. Swallowed, it is the whole
    // incident — the page renders empty and no one is told — so the level is
    // not derived from that status.
    level: 'error',
    req: request,
    source: 'localApi',
  })
}

/**
 * The original is called through `.call(payload)`: `delete` and `update` are
 * prototype methods that read `this`, while `create` is an instance property.
 * The cast carries the method's own overloads through unchanged.
 */
const capturing = <Operation extends (options: never) => Promise<unknown>>(
  operation: Operation,
  thisArg: unknown,
  context?: SentryContextFn,
): Operation =>
  (async (options: unknown) => {
    try {
      return await (
        operation as unknown as (this: unknown, options: unknown) => Promise<unknown>
      ).call(thisArg, options)
    } catch (error) {
      report(error, options, context)
      throw error
    }
  }) as unknown as Operation

/**
 * Wrap every Local API write on a live Payload instance.
 *
 * ⚠ **`jobs.queue` needs its own wrapper.** It writes through
 * `payload.db.create` unless `jobs.depth` or `jobs.runHooks` is configured, so
 * wrapping the collection operations does not reach it — and `schedule-publish`
 * is one of the two paths #1039 names.
 */
export const installLocalApiCapture = (payload: Payload, context?: SentryContextFn): void => {
  const { create, delete: remove, duplicate, update, updateGlobal } = payload
  const { queue } = payload.jobs

  payload.create = capturing(create, payload, context)
  payload.delete = capturing(remove, payload, context)
  payload.duplicate = capturing(duplicate, payload, context)
  payload.update = capturing(update, payload, context)
  payload.updateGlobal = capturing(updateGlobal, payload, context)
  payload.jobs.queue = capturing(queue, payload.jobs, context)
}
