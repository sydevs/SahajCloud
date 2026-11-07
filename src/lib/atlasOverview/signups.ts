import type { PayloadRequest, Where } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The window every sign-up comparison on the atlas is measured over.
 *
 * One constant, because two surfaces of one screen compare over it — a region
 * row's "Sign-ups · 30 days" and the Registrations tile beside it — and two
 * copies could report a different "last 30 days" on the same page.
 */
export const SIGNUP_WINDOW_DAYS = 30

/** Sign-ups in the last window, and in the one before it. */
export interface SignupWindows {
  now: number
  previous: number
}

/** The two window bounds, nearest first. */
export function signupWindowBounds(now: Date): { since: Date; windowStart: Date } {
  return {
    since: new Date(now.getTime() - 2 * SIGNUP_WINDOW_DAYS * DAY_MS),
    windowStart: new Date(now.getTime() - SIGNUP_WINDOW_DAYS * DAY_MS),
  }
}

/**
 * Registration rows split per event into this window and the one before it.
 *
 * ⚠ **One read covering both windows, not one per window.** The comparison
 * needs a count and its predecessor, and a row's own `createdAt` says which it
 * falls in — so the second query would re-read most of the first's rows to
 * answer a question arithmetic already has.
 *
 * `where` is the caller's, because what counts as in scope differs: an
 * overview's rows are every event under a region, while a tile's are one
 * manager's own. The windowing and the bucketing are shared; the scope is not.
 */
export async function loadSignupWindows(args: {
  extraWhere?: Where[]
  now: Date
  req: PayloadRequest
}): Promise<Map<number, SignupWindows>> {
  const { extraWhere = [], now, req } = args
  const { since, windowStart } = signupWindowBounds(now)

  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: {
      and: [
        { type: { equals: 'registration' } },
        { createdAt: { greater_than: since.toISOString() } },
        ...extraWhere,
      ],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req: localeIsolatedReq(req),
    select: { createdAt: true, event: true },
  })

  const byEvent = new Map<number, SignupWindows>()
  for (const doc of docs) {
    const eventId = relationId(doc.event)
    if (eventId == null) continue
    const bucket = byEvent.get(eventId) ?? { now: 0, previous: 0 }
    if (new Date(doc.createdAt) >= windowStart) bucket.now += 1
    else bucket.previous += 1
    byEvent.set(eventId, bucket)
  }
  return byEvent
}

/** The scope-wide totals of a per-event map, over the events named. */
export function sumSignupWindows(
  byEvent: Map<number, SignupWindows>,
  eventIds?: Iterable<number>,
): SignupWindows {
  const totals = { now: 0, previous: 0 }
  const rows =
    eventIds === undefined
      ? [...byEvent.values()]
      : [...eventIds].map((id) => byEvent.get(id)).filter((row) => row !== undefined)
  for (const row of rows) {
    totals.now += row.now
    totals.previous += row.previous
  }
  return totals
}
