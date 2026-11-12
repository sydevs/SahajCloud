import type { PayloadRequest, Where } from 'payload'

import { addDays } from '@/lib/eventVerification/periods'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import { listPath } from './listPath'

/** How far back a surface counts sign-ups the spam check filed. */
const SPAM_SIGNUP_WINDOW_DAYS = 7

export const SPAM_SIGNUPS: Where[] = [
  { type: { equals: 'registration' } },
  { status: { equals: 'spam' } },
]

/** The admin list of those sign-ups, as a path under the admin route. */
export const SPAM_SIGNUPS_PATH: `/${string}` = listPath('user-submissions', SPAM_SIGNUPS)

/**
 * Sign-ups filed as spam in the last week, and the sentence the admin home and
 * digest both show.
 *
 * `null` rather than a zero, as every closing line here answers: it is what
 * lets a caller leave the line out without deciding a second time.
 */
export async function spamSignups(args: {
  now: Date
  overrideAccess: boolean
  req: PayloadRequest
}): Promise<null | { count: number; text: string }> {
  const { now, overrideAccess, req } = args
  const since = addDays(now, -SPAM_SIGNUP_WINDOW_DAYS)

  const { totalDocs: count } = await req.payload.count({
    collection: 'user-submissions',
    where: { and: [...SPAM_SIGNUPS, { createdAt: { greater_than: since.toISOString() } }] },
    overrideAccess,
    req: localeIsolatedReq(req),
  })

  if (count === 0) return null
  return {
    count,
    text: `${count} sign-up${count === 1 ? '' : 's'} filed as spam in the last ${SPAM_SIGNUP_WINDOW_DAYS} days`,
  }
}
