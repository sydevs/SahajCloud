/**
 * What a handler reports when it answers its own 5xx, driven through each
 * handler rather than through `capture` (#1182).
 *
 * `endpoint-guard-credential-rejected.spec.ts` covers the same seam for a
 * returned 403 (#743). This is the 5xx half: these branches **return** a
 * `Response` instead of throwing, so Payload's root `afterError` hook never
 * runs and only the handler can report. A spec on `capture` alone would not
 * see whether the branch reaches it, which is the whole defect.
 */
import type { PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({
  captureException: sentry.captureException,
  captureMessage: sentry.captureMessage,
}))

import { clientEmbedReport } from '@/collections/Clients/endpoints/report'
import { eventsGeoJson } from '@/collections/Events/endpoints/geojson'
import { setProject } from '@/collections/Managers/endpoints/setProject'
import { handleStreamWebhook } from '@/plugins/storage/cloudflareStreamWebhook'

import { capturedFrom } from '../utils/sentryCapture'
import { streamSignatureHeader } from '../utils/streamWebhookSignature'

const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

const captured = () => capturedFrom(sentry.captureMessage)
const capturedError = () => capturedFrom(sentry.captureException)

/** Every event this ticket adds carries both, whichever entry point sent it. */
const handlerTags = (handler: string) => ({ capture_source: 'handler', handler })

const reported = () =>
  sentry.captureException.mock.calls.length + sentry.captureMessage.mock.calls.length

beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * Fixture pre-mortem — what the request stubs below assume, and where each was
 * checked:
 *
 * - `req.user` is read as `{ collection, enabled }` by `requireActiveClient`
 *   and as `{ collection, type }` by `requireActiveManager`
 *   (`src/lib/endpoints/`). A `clients` user is the whole client document, as
 *   `report.ts` says, so `site.domain` and `embedMetadata` sit on it.
 * - `getPgPool` reads `req.payload.db.pool` (`src/plugins/usage/db.ts`), so a
 *   `db` with no pool is exactly the branch under test.
 * - `assertClientOriginAllowed` reads `Origin` off `req.headers` and compares
 *   it to `siteHosts(site.domain)` (`src/plugins/usage/hooks.ts`,
 *   `src/lib/clients/site.ts`).
 * - `parseBody` reads the body with `req.json()` (`src/lib/endpoints/parseBody.ts`).
 */
const clientRequest = (over: Partial<Record<string, unknown>> = {}): PayloadRequest =>
  ({
    headers: new Headers({ origin: 'https://example.org' }),
    payload: { db: {}, logger },
    query: {},
    url: 'https://cloud.sydevelopers.com/api/events/geojson',
    user: {
      collection: 'clients',
      enabled: true,
      id: 7,
      site: { domain: 'example.org' },
      embedMetadata: null,
    },
    ...over,
  }) as unknown as PayloadRequest

describe('GET /api/events/geojson, when the read fails', () => {
  const failing = (error: unknown) =>
    clientRequest({ payload: { db: {}, logger, find: vi.fn().mockRejectedValue(error) } })

  it('answers 500 and reports the exception once, naming the route', async () => {
    const thrown = new Error('connection terminated unexpectedly')
    const response = await eventsGeoJson.handler(failing(thrown))

    expect(response.status).toBe(500)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
    expect(capturedError().level).toBe('error')
    expect(capturedError().tags).toMatchObject(handlerTags('events/geojson'))
    expect(capturedError().extra).toMatchObject({ clientId: 7 })
  })

  it('still writes the line Railway sees, and only one', async () => {
    await eventsGeoJson.handler(failing(new Error('connection terminated unexpectedly')))

    expect(logger.error).toHaveBeenCalledOnce()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'eventsGeoJson: read failed', clientId: 7 }),
    )
  })

  it('reports nothing for a 4xx — a caller’s mistake is not an incident (#670)', async () => {
    // SQLSTATE 22P02: `where[eventType][equals]=bogus`, which this handler maps
    // to a 400 itself because no root hook runs for it. Drizzle keeps pg's own
    // error on `cause`, which is where `findPostgresError` reads the code
    // (`src/lib/databaseErrors/index.ts`).
    const castError = Object.assign(new Error('query failed'), {
      cause: {
        code: '22P02',
        message: 'invalid input value for enum enum_events_event_type: "bogus"',
      },
    })
    const response = await eventsGeoJson.handler(failing(castError))

    expect(response.status).toBe(400)
    expect(reported()).toBe(0)
  })
})

describe('POST /api/clients/report, when the pool is gone', () => {
  const body = {
    origin: 'https://example.org',
    pathname: '/classes',
    mode: 'inline',
    topLevel: true,
    urlWritable: true,
    paramPersisted: true,
    routing: 'query',
  }

  const request = (over: Record<string, unknown> = {}) =>
    clientRequest({
      json: vi.fn().mockResolvedValue({ ...body, ...over }),
      url: 'https://cloud.sydevelopers.com/api/clients/report',
    })

  it('answers 500 and reports once, as a message — there is no exception', async () => {
    const response = await clientEmbedReport.handler(request())

    expect(response.status).toBe(500)
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
    expect(sentry.captureMessage.mock.calls[0]?.[0]).toBe(
      'clientEmbedReport: Postgres pool unavailable; report dropped',
    )
    expect(captured().level).toBe('error')
    expect(captured().tags).toMatchObject(handlerTags('clients/report'))
    expect(captured().extra).toMatchObject({ clientId: 7 })
  })

  it('still writes the line Railway sees, and only one', async () => {
    await clientEmbedReport.handler(request())

    expect(logger.error).toHaveBeenCalledOnce()
    expect(logger.error).toHaveBeenCalledWith({
      msg: 'clientEmbedReport: Postgres pool unavailable; report dropped',
      clientId: 7,
    })
  })

  it('reports nothing for a refused mount, which answers 400', async () => {
    const response = await clientEmbedReport.handler(request({ pathname: '/classes#map' }))

    expect(response.status).toBe(400)
    expect(reported()).toBe(0)
  })
})

describe('POST /api/managers/set-project, when the write fails', () => {
  const request = (error: unknown) =>
    ({
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ currentProject: null }),
      payload: { logger, update: vi.fn().mockRejectedValue(error) },
      url: 'https://cloud.sydevelopers.com/api/managers/set-project',
      user: { collection: 'managers', id: 12, type: 'admin' },
    }) as unknown as PayloadRequest

  it('answers 500 and reports the exception once, naming the route', async () => {
    const thrown = new Error('deadlock detected')
    const response = await setProject.handler(request(thrown))

    expect(response.status).toBe(500)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
    expect(capturedError().level).toBe('error')
    expect(capturedError().tags).toMatchObject(handlerTags('managers/set-project'))
    expect(capturedError().extra).toMatchObject({ managerId: 12 })
  })

  it('still writes the line Railway sees, and only one', async () => {
    await setProject.handler(request(new Error('deadlock detected')))

    expect(logger.error).toHaveBeenCalledOnce()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'setProject: failed to persist currentProject',
        managerId: 12,
      }),
    )
  })

  it('reports nothing for a project slug the schema refuses, which answers 400', async () => {
    const req = {
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ currentProject: 'no-such-project' }),
      payload: { logger, update: vi.fn() },
      user: { collection: 'managers', id: 12, type: 'admin' },
    } as unknown as PayloadRequest

    expect((await setProject.handler(req)).status).toBe(400)
    expect(reported()).toBe(0)
  })
})

describe('the Cloudflare Stream webhook', () => {
  const SECRET = 'test-webhook-signing-secret-with-32-plus-chars'
  const NOW_SECONDS = 1_750_000_000
  const UID = 'test-video-uid-abc123'
  const TAGS = handlerTags('cloudflare-stream-webhook')

  const readyBody = JSON.stringify({
    uid: UID,
    readyToStream: true,
    status: { state: 'ready', pctComplete: '100.000000' },
  })

  const respondWith = (body: unknown) =>
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

  const enabled = respondWith({
    success: true,
    errors: [],
    result: { default: { status: 'ready' } },
  })

  const deliver = async (over: Record<string, unknown> = {}) => {
    const rawBody = (over.rawBody as string) ?? readyBody
    vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000)
    return handleStreamWebhook({
      rawBody,
      signatureHeader: await streamSignatureHeader(rawBody, SECRET, NOW_SECONDS),
      secret: SECRET,
      accountId: 'test-account-id',
      apiKey: 'test-api-key',
      logger,
      fetchFn: enabled,
      ...over,
    })
  }

  it('reports a missing signing secret as the deployment’s own gap', async () => {
    const result = await deliver({ secret: undefined })

    expect(result.status).toBe(503)
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
    // Outside production nothing configures the secret, so it is an answer.
    expect(captured().level).toBe('warning')
    expect(captured().tags).toMatchObject(TAGS)
    expect(logger.warn).toHaveBeenCalledWith({
      msg: 'Cloudflare Stream webhook secret not configured',
    })
  })

  it('alerts on that same gap in production', async () => {
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'production')

    const result = await deliver({ secret: undefined })

    expect(result.status).toBe(503)
    expect(captured().level).toBe('error')
    vi.unstubAllEnvs()
  })

  it('reports a video Cloudflare could not process, though it answers 200', async () => {
    const rawBody = JSON.stringify({
      uid: 'bad-video',
      status: {
        state: 'error',
        errorReasonCode: 'ERR_MALFORMED_VIDEO',
        errorReasonText: 'The video was deemed to be corrupted',
      },
    })
    const result = await deliver({ rawBody })

    expect(result.status).toBe(200)
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
    expect(captured().level).toBe('error')
    expect(captured().tags).toMatchObject(TAGS)
    expect(captured().extra).toMatchObject({
      uid: 'bad-video',
      errorReasonCode: 'ERR_MALFORMED_VIDEO',
    })
  })

  it('reports missing Cloudflare credentials as the deployment’s own gap', async () => {
    const result = await deliver({ accountId: undefined, apiKey: undefined })

    expect(result.status).toBe(503)
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
    expect(captured().level).toBe('warning')
    expect(captured().extra).toMatchObject({ uid: UID })
  })

  it('reports a downloads call the API refused', async () => {
    const result = await deliver({
      fetchFn: respondWith({ success: false, errors: [{ message: 'Video not ready yet' }] }),
    })

    expect(result.status).toBe(500)
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
    expect(captured().level).toBe('error')
    expect(captured().extra).toMatchObject({ uid: UID, errors: 'Video not ready yet' })
  })

  it('reports a ready video whose follow-up work never ran', async () => {
    const thrown = new Error('transcript queue unreachable')
    const result = await deliver({ onReady: vi.fn().mockRejectedValue(thrown) })

    // The video IS ready and its downloads ARE enabled, so Cloudflare must not
    // retry — but the transcript it should have started never will.
    expect(result.status).toBe(200)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
    expect(capturedError().level).toBe('error')
    expect(capturedError().extra).toMatchObject({ uid: UID })
  })

  it('reports a downloads response that did not match the schema', async () => {
    const result = await deliver({ fetchFn: respondWith({ success: 'yes' }) })

    expect(result.status).toBe(500)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(capturedError().tags).toMatchObject(TAGS)
    expect(capturedError().extra).toMatchObject({ uid: UID })
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'Cloudflare downloads API response validation failed' }),
    )
  })

  it('reports a downloads call that threw', async () => {
    const thrown = new Error('socket hang up')
    const result = await deliver({
      fetchFn: vi.fn().mockRejectedValue(thrown) as unknown as typeof fetch,
    })

    expect(result.status).toBe(500)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
    expect(capturedError().extra).toMatchObject({ uid: UID })
  })

  it('reports nothing for a signature it refuses — that is a caller, not an incident', async () => {
    const result = await handleStreamWebhook({
      rawBody: readyBody,
      signatureHeader: null,
      secret: SECRET,
      accountId: 'test-account-id',
      apiKey: 'test-api-key',
      logger,
    })

    expect(result.status).toBe(400)
    expect(reported()).toBe(0)
  })

  it('reports nothing for a payload it refuses, or a state it ignores', async () => {
    expect((await deliver({ rawBody: JSON.stringify({ uid: 'abc' }) })).status).toBe(400)
    expect(
      (
        await deliver({
          rawBody: JSON.stringify({ uid: UID, status: { state: 'inprogress' } }),
        })
      ).status,
    ).toBe(200)

    expect(reported()).toBe(0)
  })
})

/**
 * The guarantee every site above leans on: `capture` owns a never-throw body, so
 * no handler needs a `try` of its own around its own reporting.
 */
describe('a telemetry failure never reaches the caller', () => {
  it('leaves a handler’s status and body exactly as they were', async () => {
    sentry.captureException.mockImplementation(() => {
      throw new Error('transport is down')
    })
    logger.error.mockImplementation(() => {
      throw new Error('log destination is down')
    })

    const response = await eventsGeoJson.handler(
      clientRequest({
        payload: { db: {}, logger, find: vi.fn().mockRejectedValue(new Error('read failed')) },
      }),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      errors: [{ message: 'Failed to build the GeoJSON feed.' }],
    })
  })

  it('leaves the webhook’s status and body exactly as they were', async () => {
    sentry.captureMessage.mockImplementation(() => {
      throw new Error('transport is down')
    })
    logger.warn.mockImplementation(() => {
      throw new Error('log destination is down')
    })

    const result = await handleStreamWebhook({
      rawBody: '{}',
      signatureHeader: 'time=1,sig1=abc',
      secret: undefined,
      accountId: 'test-account-id',
      apiKey: 'test-api-key',
      logger,
    })

    expect(result).toEqual({ status: 503, body: { error: 'Webhook secret not configured' } })
  })
})
