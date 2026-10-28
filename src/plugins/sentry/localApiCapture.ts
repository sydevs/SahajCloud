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
 * Two gates keep this to writes the admin makes:
 *
 * - **`isHandlingPayloadRoute()`** — Save, Publish and the periodic autosave
 *   submit to the REST API, and a routed failure already reports through
 *   `afterError`. Our own hooks write through the Local API while a request is
 *   in flight, so without this gate an ordinary 400 would report twice.
 * - **an acting user** — a scheduled job, a seed and an operator script all
 *   write with none, and none of them is a write the admin made. The managers
 *   sign-in action has none either, by design, and reports from its own catch
 *   rather than from here.
 *
 * ⚠ **The wrapper rethrows, always.** It observes; it must not change what any
 * caller sees.
 */
import type { Payload, PayloadRequest } from 'payload'

import { captureFailure, type SentryContextFn } from './captureFailure'
import { isHandlingPayloadRoute } from './payloadRouteScope'

/** The shape of a Local API write's options that this module reads. */
type WriteOptions = {
  collection?: unknown
  req?: PayloadRequest
  slug?: unknown
  user?: unknown
}

const writeOptions = (value: unknown): WriteOptions =>
  typeof value === 'object' && value !== null ? (value as WriteOptions) : {}

/** `collection` for a document write, `slug` for a global one. */
const entityOf = ({ collection, slug }: WriteOptions): string | undefined => {
  if (typeof collection === 'string') return collection
  return typeof slug === 'string' ? slug : undefined
}

const statusOf = (error: unknown): number =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  typeof (error as { status: unknown }).status === 'number'
    ? (error as { status: number }).status
    : 500

const report = (error: unknown, options: unknown, context?: SentryContextFn): void => {
  if (isHandlingPayloadRoute()) return

  const parsed = writeOptions(options)
  const { req } = parsed
  if (!parsed.user && !req?.user) return

  captureFailure({
    collection: entityOf(parsed),
    context,
    error,
    // A `ValidationError` answers 400 on a route. Swallowed, it is the whole
    // incident — the page renders empty and no one is told — so the level is
    // not derived from that status.
    level: 'error',
    req,
    source: 'localApi',
    status: statusOf(error),
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
export const installLocalApiCapture = (
  payload: Payload,
  { context }: { context?: SentryContextFn } = {},
): void => {
  const { create, delete: remove, duplicate, update, updateGlobal } = payload
  const { queue } = payload.jobs

  payload.create = capturing(create, payload, context)
  payload.delete = capturing(remove, payload, context)
  payload.duplicate = capturing(duplicate, payload, context)
  payload.update = capturing(update, payload, context)
  payload.updateGlobal = capturing(updateGlobal, payload, context)
  payload.jobs.queue = capturing(queue, payload.jobs, context)
}
