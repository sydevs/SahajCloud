/**
 * The exclusion a spam verdict on a registration actually buys.
 *
 * One rule with two expressions — an in-memory predicate and a `Where` — so the
 * matrix below is what keeps them from drifting. Their consumers (the reminder
 * sweep, the follow-up sweep, the fullness count) re-point at
 * `user-submissions` in Phase 3; this is the rule waiting for them.
 */
import { describe, expect, it } from 'vitest'

import { activeRegistrationWhere, isActiveRegistration } from '@/lib/registrations/active'
import type { UserSubmission } from '@/payload-types'

/** Every status, so a new one cannot be added without a decision being made. */
const STATUSES: UserSubmission['status'][] = ['pending', 'accepted', 'rejected', 'failed']

describe('isActiveRegistration', () => {
  it('counts a registration that is pending or accepted', () => {
    expect(isActiveRegistration({ type: 'registration', status: 'pending' })).toBe(true)
    expect(isActiveRegistration({ type: 'registration', status: 'accepted' })).toBe(true)
  })

  /**
   * The row is flagged, not deleted — it stands, and so does any email already
   * sent. What `rejected` buys is exactly this: no more reminders, and no seat
   * occupied.
   */
  it('drops a registration screening refused', () => {
    expect(isActiveRegistration({ type: 'registration', status: 'rejected' })).toBe(false)
  })

  /**
   * A `failed` row's own delivery never happened, so the person has never been
   * told they are registered. Reminding them about an event they do not know
   * they signed up for is worse than silence.
   */
  it('drops a registration whose confirmation never arrived', () => {
    expect(isActiveRegistration({ type: 'registration', status: 'failed' })).toBe(false)
  })

  it('is never true for another type', () => {
    for (const type of ['contact', 'subscribe', 'proposal'] as const) {
      for (const status of STATUSES) {
        expect(isActiveRegistration({ type, status })).toBe(false)
      }
    }
  })
})

describe('activeRegistrationWhere', () => {
  /**
   * The predicate and the query must agree on every status, or a reminder sweep
   * selects rows the code then skips — or worse, the other way round.
   */
  it('agrees with the predicate on every status', () => {
    const excluded = activeRegistrationWhere.status as { not_in: string[] }

    for (const status of STATUSES) {
      const inMemory = isActiveRegistration({ type: 'registration', status })
      const inSql = !excluded.not_in.includes(status)
      expect({ status, inSql }).toEqual({ status, inSql: inMemory })
    }
  })

  it('selects only registrations', () => {
    expect(activeRegistrationWhere.type).toEqual({ equals: 'registration' })
  })
})
