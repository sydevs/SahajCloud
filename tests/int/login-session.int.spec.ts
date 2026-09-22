/**
 * `mintManagerSessionToken` — the one place a manager session is minted
 * (sydevs/SahajCloud#836).
 *
 * Needs a database because the property under test is a stored one: the JWT
 * strategy rejects a token whose `sid` is absent from the manager's `sessions`
 * rows, so a token minted without that row authenticates nothing while looking
 * perfectly well-formed. The per-locale `roles` a minted token carries are
 * asserted by `role-based-access.int.spec.ts`, which owns #665.
 */
import type { Payload } from 'payload'

import { decodeJwt } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { mintManagerSessionToken } from '@/plugins/login/session'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

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

  const authAs = (token: string) =>
    payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })

  const sessionsOf = async (id: number | string) =>
    (
      await payload.findByID({
        collection: 'managers',
        id,
        depth: 0,
        joins: false,
        select: { sessions: true },
      })
    ).sessions ?? []

  it('authenticates as the manager, on a session row that expires with the token', async () => {
    const manager = await createVerifiedManager()

    const token = await mintManagerSessionToken(payload, manager.id)
    const { exp, sid } = decodeJwt(token) as { exp: number; sid: string }
    const session = (await sessionsOf(manager.id)).find(({ id }) => id === sid)

    expect((await authAs(token)).user?.id).toBe(manager.id)
    expect(session).toBeDefined()
    // `managers_sessions.expires_at` is NOT NULL, and a row outliving its token
    // (or the reverse) would leave the strategy and the JWT disagreeing about
    // when the session ended. The two are computed moments apart and `exp` is
    // truncated to whole seconds, so they agree to within a second, never
    // exactly — a tolerance under 1s is a coin flip on the millisecond clock.
    expect(Math.abs(Date.parse(session!.expiresAt) / 1000 - exp)).toBeLessThan(2)
  })

  it('leaves an earlier token working when a second is minted', async () => {
    const manager = await createVerifiedManager()

    const first = await mintManagerSessionToken(payload, manager.id)
    await mintManagerSessionToken(payload, manager.id)

    expect((await authAs(first)).user?.id).toBe(manager.id)
    expect(await sessionsOf(manager.id)).toHaveLength(2)
  })
})
