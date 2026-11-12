/**
 * Unit tests for the event calendar-feed token.
 *
 * Pure signing — no Payload, no DB. The token is the feed's entire access
 * control, so these cover the AC that it cannot be forged, replayed against a
 * neighbouring class, or minted for another link type.
 */
import { describe, expect, it } from 'vitest'

import {
  readEventCalendarToken,
  signEventCalendarToken,
} from '../../src/collections/Events/calendarToken'
import { signUnsubscribeToken } from '../../src/lib/registrations/unsubscribeToken'
import { signToken } from '../../src/lib/utilities/signedToken'

const SECRET = 'test-secret-abc'

describe('event calendar-feed token', () => {
  it('round-trips the event id for a valid token', async () => {
    const token = await signEventCalendarToken({ eventId: 17 }, SECRET)
    expect(await readEventCalendarToken(token, SECRET)).toEqual({
      status: 'valid',
      claims: { eventId: 17 },
    })
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signEventCalendarToken({ eventId: 17 }, SECRET)
    expect((await readEventCalendarToken(token, 'other-secret')).status).toBe('invalid')
  })

  it('rejects a forged event id — a neighbouring class fails the signature', async () => {
    const token = await signEventCalendarToken({ eventId: 17 }, SECRET)
    const [header, , signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ eventId: 18 })).toString('base64url')
    expect((await readEventCalendarToken(`${header}.${forged}.${signature}`, SECRET)).status).toBe(
      'invalid',
    )
  })

  it('rejects a tampered signature', async () => {
    const token = await signEventCalendarToken({ eventId: 17 }, SECRET)
    const [header, claims] = token.split('.')
    expect((await readEventCalendarToken(`${header}.${claims}.deadbeef`, SECRET)).status).toBe(
      'invalid',
    )
  })

  it('rejects malformed and empty tokens', async () => {
    expect((await readEventCalendarToken('', SECRET)).status).toBe('invalid')
    expect((await readEventCalendarToken('no-dot', SECRET)).status).toBe('invalid')
    expect((await readEventCalendarToken('a.b.c', SECRET)).status).toBe('invalid')
    expect((await readEventCalendarToken(undefined, SECRET)).status).toBe('invalid')
  })

  // The audience is what stops one link type's token opening another's door,
  // and both of these are signed with the very same secret.
  it('rejects a token minted for another kind', async () => {
    const unsubscribe = await signUnsubscribeToken({ submissionId: 17 }, SECRET)
    expect((await readEventCalendarToken(unsubscribe, SECRET)).status).toBe('invalid')

    const noAudience = await signToken(
      { eventId: 17 },
      { kind: 'something-else', ttlMs: null },
      SECRET,
    )
    expect((await readEventCalendarToken(noAudience, SECRET)).status).toBe('invalid')
  })

  // A claim of the wrong type is authentic but unusable, and reading it as an id
  // would hand `findByID` a string.
  it('rejects an authentic token whose claim is not a number', async () => {
    const wrongType = await signToken(
      { eventId: '17' },
      { kind: 'event-calendar-feed', ttlMs: null },
      SECRET,
    )
    expect((await readEventCalendarToken(wrongType, SECRET)).status).toBe('invalid')
  })

  it('never expires — a subscription is re-fetched for as long as someone keeps it', async () => {
    const token = await signEventCalendarToken({ eventId: 17 }, SECRET)
    const [, claims] = token.split('.')
    const decoded = JSON.parse(Buffer.from(claims!, 'base64url').toString('utf-8'))
    expect(decoded.exp).toBeUndefined()
    expect((await readEventCalendarToken(token, SECRET)).status).toBe('valid')
  })
})
