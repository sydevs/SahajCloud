import type { PayloadRequest } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

const DAY_MS = 24 * 60 * 60 * 1000

/** How far back a surface counts sign-ups the form turned away. */
export const REFUSAL_WINDOW_DAYS = 7

/**
 * Sign-ups refused before they became a submission at all, and the sentence
 * that says so.
 *
 * Counted from `registration-refusals` at stage `request`, which is an hourly
 * counter rather than a row per refusal: anyone holding the published widget
 * key can be refused for free, so a flood moves a number rather than filling a
 * table.
 *
 * ⚠ **The window and the wording live here together, because two surfaces show
 * them.** The admin home prints this line under its list and the admin digest
 * carries it as the email's closing note — written at each, the number came
 * from a constant and the "last 7 days" from a literal beside it, so changing
 * the window left the two disagreeing in text while agreeing in data.
 *
 * `null` for a quiet week: a line reading "0 sign-ups blocked" is noise on a
 * home whose whole job is what needs attention.
 */
export async function refusedAtTheForm(args: {
  now: Date
  overrideAccess: boolean
  req: PayloadRequest
}): Promise<null | { count: number; text: string }> {
  const { now, overrideAccess, req } = args
  const since = new Date(now.getTime() - REFUSAL_WINDOW_DAYS * DAY_MS)

  const { docs } = await req.payload.find({
    collection: 'registration-refusals',
    where: {
      and: [{ stage: { equals: 'request' } }, { hour: { greater_than: since.toISOString() } }],
    },
    depth: 0,
    pagination: false,
    overrideAccess,
    req: localeIsolatedReq(req),
    select: { count: true },
  })

  const count = docs.reduce((sum, row) => sum + (row.count ?? 0), 0)
  if (count === 0) return null
  return {
    count,
    text: `${count} sign-up${count === 1 ? '' : 's'} blocked at the form in the last ${REFUSAL_WINDOW_DAYS} days`,
  }
}
