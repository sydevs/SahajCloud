/**
 * `mintManagerSessionToken` — the one place a manager session is minted
 * (sydevs/SahajCloud#836).
 *
 * Needs a database because the property under test is a stored one: the JWT
 * strategy rejects a token whose `sid` is absent from the manager's `sessions`
 * rows, so a token minted without that row authenticates nothing while looking
 * perfectly well-formed.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { mintManagerSessionToken } from '@/plugins/login/session'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/** The unverified claims. Enough to read `sid` and `exp`; nothing is trusted. */
function decodeClaims(token: string): { exp: number; sid: string } {
  const [, claims] = token.split('.')
  return JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')) as {
    exp: number
    sid: string
  }
}

describe('mintManagerSessionToken', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  const createVerifiedManager = () =>
    testData.createManager(payload, { type: 'manager', _verified: true })

  const sessionsOf = async (id: number | string) =>
    (await payload.findByID({ collection: 'managers', id })).sessions ?? []

  it('records the token sid as a session row that expires with the token', async () => {
    const manager = await createVerifiedManager()

    const { exp, sid } = decodeClaims(await mintManagerSessionToken(payload, manager.id))
    const session = (await sessionsOf(manager.id)).find(({ id }) => id === sid)

    expect(session).toBeDefined()
    // `managers_sessions.expires_at` is NOT NULL, and a row outliving its token
    // (or the reverse) would leave the strategy and the JWT disagreeing about
    // when the session ended.
    expect(Date.parse(session!.expiresAt) / 1000).toBeCloseTo(exp, 0)
  })

  it('authenticates a request as that manager, with per-locale roles', async () => {
    const manager = await testData.createManager(payload, {
      type: 'manager',
      _verified: true,
      roles: { fr: ['web-translator'] },
    })

    const headers = new Headers()
    headers.set('Authorization', `JWT ${await mintManagerSessionToken(payload, manager.id)}`)
    const { user } = await payload.auth({ headers })

    expect(user?.id).toBe(manager.id)
    // accessPlugin's `localized-roles` strategy, not `local-jwt`, is what
    // answers — so a minted token carries the per-locale record too (#665).
    expect(user?.roles).toEqual({ fr: ['web-translator'] })
  })

  it('leaves an earlier token working when a second is minted', async () => {
    const manager = await createVerifiedManager()

    const first = await mintManagerSessionToken(payload, manager.id)
    await mintManagerSessionToken(payload, manager.id)

    const headers = new Headers()
    headers.set('Authorization', `JWT ${first}`)

    expect((await payload.auth({ headers })).user?.id).toBe(manager.id)
    expect(await sessionsOf(manager.id)).toHaveLength(2)
  })
})
