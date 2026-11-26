/**
 * Support impersonation (`@/plugins/login/impersonation`): the support account acts
 * as a manager, end to end through the real auth strategies.
 *
 * Needs a database because every property here is decided per request from
 * stored state — the support session row, both accounts' `type`, the target's
 * per-locale roles and its own row.
 */
import type { Payload } from 'payload'

import { decodeJwt } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CONTACT_EMAIL } from '@/lib/contact'
import { createSession } from '@/plugins/login'
import { IMPERSONATION_COOKIE } from '@/plugins/login/impersonation/cookie'
import { SUPPORT_ADDRESS_TAKEN } from '@/plugins/login/impersonation/supportAddress'

import { createRestClientWithAuth } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type Env = Awaited<ReturnType<typeof createTestEnvironment>>

describe('support impersonation', () => {
  let env: Env
  let payload: Payload
  let cleanup: () => Promise<void>
  let support: { id: number }
  let supportToken: string

  beforeAll(async () => {
    env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    support = await testData.createManager(payload, {
      email: CONTACT_EMAIL,
      type: 'admin',
      _verified: true,
    })
    supportToken = await createSession(payload, 'managers', support.id)
  })

  afterAll(async () => {
    await cleanup()
  })

  const createTarget = () =>
    testData.createManager(payload, {
      type: 'manager',
      _verified: true,
      roles: { fr: ['web-translator'] },
    })

  const restAs = (token: string, cookie?: string) =>
    createRestClientWithAuth(env, {
      Authorization: `JWT ${token}`,
      ...(cookie ? { Cookie: cookie } : {}),
    })

  /** Start impersonating `targetId` as support; answers the cookie pair to send. */
  const start = async (targetId: number | string, token = supportToken) => {
    const response = await restAs(token)(`/api/managers/impersonate/${targetId}`, {
      method: 'POST',
    })
    expect(response.status).toBe(200)
    const value = /sahajcloud-impersonation=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')
    return `${IMPERSONATION_COOKIE}=${value![1]}`
  }

  const authAs = (token: string, cookie: string) =>
    payload.auth({ headers: new Headers({ Authorization: `JWT ${token}`, Cookie: cookie }) })

  it('authenticates as the target, with per-locale roles and the support account named', async () => {
    const target = await createTarget()
    const { user } = await authAs(supportToken, await start(target.id))

    expect(user?.id).toBe(target.id)
    expect((user as { impersonatedBy?: { id: number } }).impersonatedBy?.id).toBe(support.id)
    // A flat array would mean the target was loaded past `hydrateAuthUser`.
    expect((user as { roles?: unknown }).roles).toMatchObject({ fr: ['web-translator'] })
  })

  it('refuses moving the support address onto any other account', async () => {
    const otherAdmin = await testData.createManager(payload, { type: 'admin', _verified: true })
    const asOtherAdmin = restAs(await createSession(payload, 'managers', otherAdmin.id))
    const target = await createTarget()

    for (const id of [otherAdmin.id, target.id]) {
      const moved = await asOtherAdmin(`/api/managers/${id}`, {
        method: 'PATCH',
        json: { email: CONTACT_EMAIL.toUpperCase() },
      })
      expect(moved.status).toBe(400)
      expect(moved.raw).toContain(SUPPORT_ADDRESS_TAKEN)
    }

    // The account that already holds it keeps saving.
    const kept = await restAs(supportToken)(`/api/managers/${support.id}`, {
      method: 'PATCH',
      json: { email: CONTACT_EMAIL, name: 'Support' },
    })
    expect(kept.status).toBe(200)
  })

  it('refuses anyone but the support account, and targets that are not active managers', async () => {
    const otherAdmin = await testData.createManager(payload, { type: 'admin', _verified: true })
    const otherToken = await createSession(payload, 'managers', otherAdmin.id)
    const target = await createTarget()

    const byAdmin = await restAs(otherToken)(`/api/managers/impersonate/${target.id}`, {
      method: 'POST',
    })
    expect(byAdmin.status).toBe(403)

    const ofAdmin = await restAs(supportToken)(`/api/managers/impersonate/${otherAdmin.id}`, {
      method: 'POST',
    })
    expect(ofAdmin.status).toBe(400)

    // Payload's JWT strategy yields no user while `_verified` is false, so an
    // invited manager who never confirmed would take the cookie and then read
    // as support on every request with nothing said.
    const invited = await testData.createManager(payload, { type: 'manager' })
    const ofInvited = await restAs(supportToken)(`/api/managers/impersonate/${invited.id}`, {
      method: 'POST',
    })
    expect(ofInvited.status).toBe(400)
  })

  it('reads as support again once the cookie is bound to another session', async () => {
    const target = await createTarget()
    const cookie = await start(target.id)
    const otherSession = await createSession(payload, 'managers', support.id)
    expect(decodeJwt(otherSession).sid).not.toBe(decodeJwt(supportToken).sid)

    const { user } = await authAs(otherSession, cookie)
    expect(user?.id).toBe(support.id)
  })

  it('ends on the next request once the target is no longer an active manager', async () => {
    const target = await createTarget()
    const cookie = await start(target.id)
    await payload.update({ collection: 'managers', id: target.id, data: { type: 'inactive' } })

    const { responseHeaders, user } = await authAs(supportToken, cookie)
    expect(user?.id).toBe(support.id)
    // A refused cookie clears itself rather than being re-checked on every request.
    expect(responseHeaders?.get('set-cookie')).toMatch(/sahajcloud-impersonation=;/)
  })

  it("refuses a write to the target's own row, and keeps the project switcher off it", async () => {
    const target = await createTarget()
    const cookie = await start(target.id)
    const asTarget = restAs(supportToken, cookie)

    const edit = await asTarget(`/api/managers/${target.id}`, {
      method: 'PATCH',
      json: { name: 'Renamed by support' },
    })
    expect(edit.status).toBe(403)

    const switched = await asTarget('/api/managers/set-project', {
      method: 'POST',
      json: { currentProject: 'wemeditate-web' },
    })
    expect(switched.status).toBe(200)
    expect(switched.headers.get('set-cookie')).toContain(IMPERSONATION_COOKIE)

    // A bulk write names no row, so it is refused whole rather than read for one.
    const bulk = await asTarget(`/api/managers?where[id][equals]=${target.id}`, {
      method: 'PATCH',
      json: { name: 'Renamed in bulk' },
    })
    expect(bulk.status).toBe(403)

    const stored = await payload.findByID({ collection: 'managers', id: target.id, depth: 0 })
    expect(stored.name).toBe(target.name)
    expect(stored.currentProject ?? null).toBeNull()
  })

  it("refreshes support's own token, and writes no preference for the target", async () => {
    const target = await createTarget()
    const asTarget = restAs(supportToken, await start(target.id))

    const refreshed = await asTarget('/api/managers/refresh-token', { method: 'POST' })
    expect(refreshed.status).toBe(200)
    const token = /payload-token=([^;]+)/.exec(refreshed.headers.get('set-cookie') ?? '')![1]!
    expect(decodeJwt(token)).toMatchObject({ id: support.id, sid: decodeJwt(supportToken).sid })

    const saved = await asTarget('/api/payload-preferences/impersonation-spec', {
      method: 'POST',
      json: { value: { columns: [] } },
    })
    expect(saved.status).toBe(200)
    const { totalDocs } = await payload.find({
      collection: 'payload-preferences',
      where: { key: { equals: 'impersonation-spec' } },
    })
    expect(totalDocs).toBe(0)
  })

  it('names the support account on /me and clears the cookie on exit', async () => {
    const target = await createTarget()
    const asTarget = restAs(supportToken, await start(target.id))

    const me = await asTarget('/api/managers/me')
    const meUser = me.body.user as { id: number; impersonatedBy?: { id: number } }
    expect(meUser.id).toBe(target.id)
    expect(meUser.impersonatedBy?.id).toBe(support.id)

    const stop = await asTarget('/api/managers/stop-impersonating', { method: 'POST' })
    expect(stop.status).toBe(200)
    expect(stop.headers.get('set-cookie')).toMatch(/sahajcloud-impersonation=;/)
  })

  it("signs support's own session out, not the target's", async () => {
    const target = await createTarget()
    const session = await createSession(payload, 'managers', support.id)
    const cookie = await start(target.id, session)

    const logout = await restAs(session, cookie)('/api/managers/logout', { method: 'POST' })
    expect(logout.status).toBe(200)
    expect(logout.headers.get('set-cookie')).toMatch(/sahajcloud-impersonation=;/)

    const { user } = await payload.auth({
      headers: new Headers({ Authorization: `JWT ${session}` }),
    })
    expect(user).toBeNull()
  })
})
