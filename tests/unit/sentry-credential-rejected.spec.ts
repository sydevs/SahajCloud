/**
 * The plugin's own wiring, not just the helper it calls.
 *
 * A pure spec on `classifyAuthAttempt` cannot see whether `setFingerprint` is
 * ever reached, or whether the log line is emitted — and unreached code with a
 * green spec beside it is exactly the shape #734 set out to make visible.
 */
import type { Config, PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sentryPlugin, type SentryPluginOptions } from '@/plugins/sentry/sentryPlugin'

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({
  captureException: sentry.captureException,
}))

/** The capture context `captureFailure` handed the SDK on its latest call. */
const captured = () =>
  (sentry.captureException.mock.calls.at(-1)?.[1] ?? {}) as {
    extra?: Record<string, unknown>
    fingerprint?: string[]
    level?: string
    tags?: Record<string, unknown>
    user?: Record<string, unknown>
  }

// The plugin short-circuits without a DSN, and `@/lib/env` parses the real
// environment. Mocked so the lane never depends on a `.env` value.
vi.mock('@/lib/env', () => ({
  serverEnv: { NEXT_PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.de.sentry.io/1' },
}))
vi.mock('@/lib/env/deploymentEnvironment', () => ({
  deploymentEnvironment: () => 'test',
}))

const KEY = '3f7c1a2b-9d4e-4a10-8b55-6c2e0f9a1d33'
const USER_AGENT = 'node'
const IP = '203.0.113.7'
const URL = 'https://cloud.sydevelopers.com/api/pages/73?depth=2&trash=false'

const logger = { warn: vi.fn(), info: vi.fn() }

const buildRequest = (authorization: string | null, user?: { id: number }): PayloadRequest => {
  const headers = new Headers({ 'user-agent': USER_AGENT, 'cf-connecting-ip': IP })
  if (authorization !== null) headers.set('authorization', authorization)

  return {
    headers,
    user,
    locale: 'en',
    url: URL,
    // `collections` is how the hook bounds the caller-supplied slug. Keyed by
    // slug, the shape Payload builds it in.
    payload: { logger, collections: { clients: {}, managers: {} } },
  } as unknown as PayloadRequest
}

/**
 * Runs the plugin's `afterError` hook the way Payload's route error handler does.
 *
 * `captureErrors` mirrors `src/payload.config.ts`, which is what decides that a
 * 403 reaches this hook at all.
 */
const captureError = async (
  status: number,
  req: PayloadRequest,
  options: Partial<SentryPluginOptions> = {},
) => {
  const config = sentryPlugin({ captureErrors: [400, 403, 404], ...options })({
    hooks: {},
  } as Config)
  const afterError = config.hooks?.afterError?.[0]
  if (!afterError) throw new Error('sentryPlugin registered no afterError hook')

  const error = Object.assign(new Error('Forbidden'), { status })
  await afterError({ error, req } as unknown as Parameters<typeof afterError>[0])
}

const tags = () => captured().tags ?? {}
const extras = () => captured().extra ?? {}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a 403 with no credential presented', () => {
  it('keeps its warning level and its default grouping', async () => {
    await captureError(403, buildRequest(null))

    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(captured().level).toBe('warning')
    expect(captured().fingerprint).toBeUndefined()
    expect(tags()).not.toHaveProperty('key_fingerprint')
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

describe('a 403 whose credential authenticated', () => {
  it('is an ordinary authorisation denial, not a broken integration', async () => {
    await captureError(403, buildRequest(`clients API-Key ${KEY}`, { id: 12 }))

    expect(captured().level).toBe('warning')
    expect(captured().fingerprint).toBeUndefined()
    expect(tags()).not.toHaveProperty('auth_outcome')
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

describe('a 403 whose credential was rejected', () => {
  beforeEach(async () => {
    await captureError(403, buildRequest(`clients API-Key ${KEY}`))
  })

  it('is captured at error level, in a group of its own', () => {
    expect(captured().level).toBe('error')
    expect(captured().fingerprint).toEqual(['credential-rejected', '403', 'clients'])
  })

  it('carries the user agent, the collection and a key fingerprint', () => {
    expect(tags()).toMatchObject({
      auth_outcome: 'rejected',
      auth_collection: 'clients',
      auth_scheme: 'API-Key',
      key_fingerprint: expect.stringMatching(/^[0-9a-f]{12}$/),
    })
    expect(extras()).toMatchObject({ userAgent: USER_AGENT, url: URL })
  })

  it('reports the IP on Sentry`s own user field, where the PII scrubbers reach it', () => {
    // In an `extra` it would be opaque context, past both `sendDefaultPii:
    // false` and the project`s "Prevent Storing of IP Addresses" setting.
    expect(captured().user).toEqual({ ip_address: IP })
    expect(extras()).not.toHaveProperty('ip')
  })

  it('mirrors the denial to the application log at WARN, with the same fields', () => {
    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
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
      sentry.captureException.mock.calls.map(([, context]) => context),
      logger.warn.mock.calls,
    ])

    expect(written).not.toContain(KEY)
    expect(written).not.toContain(KEY.slice(0, 8))
    expect(written).not.toContain(KEY.slice(-12))
  })
})

describe('a 403 naming a collection that does not exist', () => {
  it('groups under `unknown`, so a caller cannot mint a Sentry issue per word', async () => {
    // The slug is a word out of the request header and it reaches a grouping
    // fingerprint. Unbounded, spraying `Authorization: <random> API-Key x`
    // would open one Sentry issue per value — the very thing grouping by
    // collection rather than by key fingerprint exists to prevent.
    await captureError(403, buildRequest(`made-up-slug API-Key ${KEY}`))

    expect(captured().fingerprint).toEqual(['credential-rejected', '403', 'unknown'])
    expect(tags().auth_collection).toBeUndefined()
  })
})

describe('a 500 whose credential was rejected', () => {
  it('keeps a server error grouped as a server error', async () => {
    // The credential is not what is wrong with a 500, and re-grouping it under
    // `credential-rejected` would bury a real incident.
    await captureError(500, buildRequest(`clients API-Key ${KEY}`))

    expect(captured().level).toBe('error')
    expect(captured().fingerprint).toBeUndefined()
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
