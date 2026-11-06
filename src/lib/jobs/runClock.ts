import type { PayloadRequest } from 'payload'

/**
 * The time a task run treats as now: `req.context.now` when a test set a
 * `Date` there, the wall clock otherwise.
 */
export function runClock(req: Pick<PayloadRequest, 'context'>): Date {
  const now = (req.context as { now?: unknown } | undefined)?.now
  return now instanceof Date ? now : new Date()
}
