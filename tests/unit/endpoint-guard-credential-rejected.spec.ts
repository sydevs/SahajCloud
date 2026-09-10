/**
 * The guard's own reporting, driven through `requireActiveClient` itself.
 *
 * `sentry-credential-rejected.spec.ts` covers the same signal on the path that
 * THROWS. This is the path that does not: the guard returns a 403 `Response`, so
 * no `afterError` hook ever runs and only the guard can report (#743). A pure
 * spec on `reportRejectedCredential` would not see whether the guard reaches it,
 * which is the whole defect.
 */
import type { PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requireActiveClient } from '@/lib/endpoints'

const sentry = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  scope: {
    setUser: vi.fn(),
    setTag: vi.fn(),
    setExtra: vi.fn(),
    setLevel: vi.fn(),
    setFingerprint: vi.fn(),
  },
}))

vi.mock('@sentry/nextjs', () => ({
  captureMessage: sentry.captureMessage,
  withScope: (callback: (scope: typeof sentry.scope) => void) => callback(sentry.scope),
}))

vi.mock('@/lib/env/deploymentEnvironment', () => ({
  deploymentEnvironment: () => 'test',
}))

const KEY = '00000000-1111-4222-8333-444444444444'
const USER_AGENT = 'node'
const IP = '203.0.113.7'
const URL = 'https://cloud.sydevelopers.com/api/atlas/seo?path=/gb/london'

const logger = { warn: vi.fn(), info: vi.fn() }

/**
 * Fixture pre-mortem — what this assumes about the real configuration:
 *
 * - `req.user` is read as `{ collection, _status }`. Checked against
 *   `src/lib/endpoints/requireActiveClient.ts`, the only reader.
 * - `req.headers` is a `Headers`, and `req.payload.collections` is keyed by
 *   slug. Both checked against `src/payload.config.ts` and shared with
 *   `sentry-credential-rejected.spec.ts`'s builder.
 * - The header format is `<slug> API-Key <key>`, pinned by
 *   `src/plugins/openapi/specFilter.ts`.
 */
const buildRequest = (
  authorization: string | null,
  user?: { collection: string; _status?: string },
): PayloadRequest => {
  const headers = new Headers({ 'user-agent': USER_AGENT, 'cf-connecting-ip': IP })
  if (authorization !== null) headers.set('authorization', authorization)

  return {
    headers,
    user,
    url: URL,
    payload: { logger, collections: { clients: {}, managers: {} } },
  } as unknown as PayloadRequest
}

const tags = () => Object.fromEntries(sentry.scope.setTag.mock.calls)
const extras = () => Object.fromEntries(sentry.scope.setExtra.mock.calls)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a denial whose credential was rejected', () => {
  let denied: Response | null

  beforeEach(() => {
    denied = requireActiveClient(buildRequest(`clients API-Key ${KEY}`))
  })

  it('still denies the caller exactly as before', async () => {
    expect(denied?.status).toBe(403)
    expect(await denied?.json()).toEqual({
      errors: [{ message: 'You are not allowed to perform this action.' }],
    })
  })

  it('is captured at error level, in a group of its own', () => {
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
    expect(sentry.scope.setLevel).toHaveBeenCalledWith('error')
    expect(sentry.scope.setFingerprint).toHaveBeenCalledWith([
      'credential-rejected',
      '403',
      'clients',
    ])
  })

  it('carries the same attribution the throwing path established (#734)', () => {
    expect(tags()).toMatchObject({
      auth_outcome: 'rejected',
      auth_collection: 'clients',
      auth_scheme: 'API-Key',
      key_fingerprint: expect.stringMatching(/^[0-9a-f]{12}$/),
      environment: 'test',
    })
    expect(extras()).toMatchObject({ userAgent: USER_AGENT, url: URL, status: 403 })
    // The IP goes on Sentry's own user field, where `sendDefaultPii: false` and
    // the project's "Prevent Storing of IP Addresses" setting both reach it.
    expect(sentry.scope.setUser).toHaveBeenCalledWith({ ip_address: IP })
    expect(extras()).not.toHaveProperty('ip')
  })

  it('mirrors the denial to the application log at WARN, naming this path', () => {
    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'API credential presented and rejected',
        source: 'requireActiveClient',
        status: 403,
        url: URL,
        authCollection: 'clients',
        authScheme: 'API-Key',
        keyFingerprint: tags().key_fingerprint,
        userAgent: USER_AGENT,
        ip: IP,
      }),
    )
  })

  it('puts no part of the key into Sentry or the log', () => {
    const written = JSON.stringify([
      sentry.captureMessage.mock.calls,
      sentry.scope.setTag.mock.calls,
      sentry.scope.setExtra.mock.calls,
      sentry.scope.setUser.mock.calls,
      sentry.scope.setFingerprint.mock.calls,
      logger.warn.mock.calls,
    ])

    expect(written).not.toContain(KEY)
    expect(written).not.toContain(KEY.slice(0, 8))
    expect(written).not.toContain(KEY.slice(-12))
  })
})

describe('a denial that presented no credential', () => {
  it('produces no new signal — an anonymous read is ordinary traffic', () => {
    const denied = requireActiveClient(buildRequest(null))

    expect(denied?.status).toBe(403)
    expect(sentry.captureMessage).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

describe('a denial by a caller who did authenticate', () => {
  it('stays silent for an unpublished client — the key worked, the state did not', () => {
    // A draft client authenticates and is then denied on `_status`. Its
    // credential is not what is wrong, so reporting it would name a working
    // integration as a broken one.
    const denied = requireActiveClient(
      buildRequest(`clients API-Key ${KEY}`, { collection: 'clients', _status: 'draft' }),
    )

    expect(denied?.status).toBe(403)
    expect(sentry.captureMessage).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('stays silent for a manager reaching a client endpoint', () => {
    const denied = requireActiveClient(buildRequest(null, { collection: 'managers' }))

    expect(denied?.status).toBe(403)
    expect(sentry.captureMessage).not.toHaveBeenCalled()
  })
})

describe('reporting never costs the caller its 403', () => {
  it('survives a request stub carrying no headers and no payload', () => {
    const denied = requireActiveClient({ user: null } as unknown as PayloadRequest)

    expect(denied?.status).toBe(403)
    expect(sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('swallows a logger that throws, rather than turning the 403 into a 500', () => {
    const req = buildRequest(`clients API-Key ${KEY}`)
    logger.warn.mockImplementationOnce(() => {
      throw new Error('transport closed')
    })

    expect(() => requireActiveClient(req)).not.toThrow()
    expect(requireActiveClient(req)?.status).toBe(403)
  })
})

describe('a published client', () => {
  it('is allowed through, and reports nothing', () => {
    const denied = requireActiveClient(
      buildRequest(`clients API-Key ${KEY}`, { collection: 'clients', _status: 'published' }),
    )

    expect(denied).toBeNull()
    expect(sentry.captureMessage).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
