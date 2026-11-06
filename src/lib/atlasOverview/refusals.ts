import type { PayloadRequest, Where } from 'payload'

import * as qs from 'qs-esm'

import { addDays } from '@/lib/eventVerification/periods'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

/** How far back a surface counts sign-ups the spam check filed. */
const SPAM_SIGNUP_WINDOW_DAYS = 7

const SPAM_SIGNUPS: Where[] = [{ type: { equals: 'registration' } }, { status: { equals: 'spam' } }]

/** The admin list of those sign-ups, as a path under the admin route. */
export const SPAM_SIGNUPS_PATH: `/${string}` = `/collections/user-submissions${qs.stringify(
  { where: { and: SPAM_SIGNUPS } },
  { addQueryPrefix: true },
)}`

/**
 * Sign-ups filed as spam in the last week, and the sentence the admin home and
 * digest both show — `null` for a quiet week.
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
