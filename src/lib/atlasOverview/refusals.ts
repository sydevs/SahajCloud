import type { PayloadRequest, Where } from 'payload'

import { addDays } from '@/lib/eventVerification/periods'

import { countNote } from './countNote'
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
 * digest both show — `null` for a quiet week.
 */
export async function spamSignups(args: {
  now: Date
  overrideAccess: boolean
  req: PayloadRequest
}): Promise<null | { count: number; text: string }> {
  const since = addDays(args.now, -SPAM_SIGNUP_WINDOW_DAYS)
  return countNote({
    ...args,
    where: { and: [...SPAM_SIGNUPS, { createdAt: { greater_than: since.toISOString() } }] },
    text: (count) =>
      `${count} sign-up${count === 1 ? '' : 's'} filed as spam in the last ${SPAM_SIGNUP_WINDOW_DAYS} days`,
  })
}
