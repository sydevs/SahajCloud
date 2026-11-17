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

import { APIError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({
  captureException: sentry.captureException,
  captureMessage: sentry.captureMessage,
}))

import { clientEmbedReport } from '@/collections/Clients/endpoints/report'
import { eventsGeoJson } from '@/collections/Events/endpoints/geojson'
import { setProject } from '@/collections/Managers/endpoints/setProject'
import { blockUser } from '@/collections/Users/endpoints/block'
import { atlasChallenge } from '@/endpoints/atlas/challenge'
import { readFailureResponse, requireIntegerClientId } from '@/lib/endpoints'
import { requestTranscript } from '@/lib/transcripts/request'
import { handleStreamWebhook } from '@/plugins/storage/cloudflareStreamWebhook'
import { r2NativeAdapter } from '@/plugins/storage/r2NativeAdapter'

import { capturedFrom } from '../utils/sentryCapture'
import {
  readyStreamPayload,
  STREAM_DOWNLOADS_ENABLED,
  STREAM_NOW_SECONDS,
  STREAM_SECRET,
  STREAM_UID,
  streamFetchAnswering,
  streamSignatureHeader,
} from '../utils/streamWebhook'

const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

const captured = () => capturedFrom(sentry.captureMessage)
const capturedError = () => capturedFrom(sentry.captureException)

/** What `handlerTags` builds, restated so a renamed tag reds this spec. */
const handlerTags = (handler: string) => ({ capture_source: 'handler', handler })

const reported = () =>
  sentry.captureException.mock.calls.length + sentry.captureMessage.mock.calls.length

beforeEach(() => {
  // `reset`, not `clear`: the telemetry-failure case below installs throwing
  // implementations, and `clearAllMocks` would keep them for every later case.
  vi.resetAllMocks()
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

  it('reports nothing when a query gate refused the caller', async () => {
    // `validateClientQueryParamsHook` throws APIError(400) for a missing
    // `select`, and the origin gate APIError(403) — both the caller's, and both
    // surfaced verbatim.
    const response = await eventsGeoJson.handler(failing(new APIError('select is required', 400)))

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
  const request = ({ error, body = { currentProject: null } }: Record<string, unknown> = {}) =>
    ({
      headers: new Headers(),
      json: vi.fn().mockResolvedValue(body),
      payload: { logger, update: vi.fn().mockRejectedValue(error) },
      url: 'https://cloud.sydevelopers.com/api/managers/set-project',
      user: { collection: 'managers', id: 12, type: 'admin' },
    }) as unknown as PayloadRequest

  it('answers 500 and reports the exception once, naming the route', async () => {
    const thrown = new Error('deadlock detected')
    const response = await setProject.handler(request({ error: thrown }))

    expect(response.status).toBe(500)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
    expect(capturedError().level).toBe('error')
    expect(capturedError().tags).toMatchObject(handlerTags('managers/set-project'))
    expect(capturedError().extra).toMatchObject({ managerId: 12 })
  })

  it('still writes the line Railway sees, and only one', async () => {
    await setProject.handler(request({ error: new Error('deadlock detected') }))

    expect(logger.error).toHaveBeenCalledOnce()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'setProject: failed to persist currentProject',
        managerId: 12,
      }),
    )
  })

  it('reports nothing for a project slug the schema refuses, which answers 400', async () => {
    const response = await setProject.handler(request({ body: { currentProject: 'no-such' } }))

    expect(response.status).toBe(400)
    expect(reported()).toBe(0)
  })
})

/**
 * The shared seam the four `/api/atlas/*` endpoints answer their own 500s
 * through. Driving it directly covers all six of their branches: each passes
 * the same arguments and differs only in the wording.
 */
describe('readFailureResponse, the shared read-failed answer', () => {
  const req = clientRequest()

  it('reports the exception and names the handler it came from', () => {
    const thrown = new Error('region tree read failed')
    const response = readFailureResponse(
      req,
      thrown,
      'Failed to build the sitemap for this client.',
      { handler: 'atlas/sitemap', msg: 'atlasSitemap: read failed', clientId: 7 },
    )

    expect(response.status).toBe(500)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
    expect(capturedError().tags).toMatchObject(handlerTags('atlas/sitemap'))
    expect(capturedError().extra).toMatchObject({ clientId: 7 })
    expect(logger.error).toHaveBeenCalledOnce()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'atlasSitemap: read failed', clientId: 7 }),
    )
  })

  it('reports nothing for an APIError, which carries the caller’s own status', () => {
    const response = readFailureResponse(
      req,
      new APIError('select is required', 400),
      'Failed to build the sitemap for this client.',
      { handler: 'atlas/sitemap', msg: 'atlasSitemap: read failed', clientId: 7 },
    )

    expect(response.status).toBe(400)
    expect(reported()).toBe(0)
  })

  it('reports a client id that is not an integer, which would answer "you own nothing"', () => {
    const caller = requireIntegerClientId(
      clientRequest({ user: { collection: 'clients', enabled: true, id: 'abc' } }),
      'Failed to build the sitemap for this client.',
      'atlas/sitemap',
    )

    expect(caller.ok).toBe(false)
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
    expect(captured().level).toBe('error')
    expect(captured().tags).toMatchObject(handlerTags('atlas/sitemap'))
  })
})

describe('the Cloudflare Stream webhook', () => {
  const TAGS = handlerTags('cloudflare-stream-webhook')

  const deliver = async (over: Record<string, unknown> = {}) => {
    const rawBody = (over.rawBody as string) ?? readyStreamPayload()
    vi.spyOn(Date, 'now').mockReturnValue(STREAM_NOW_SECONDS * 1000)
    return handleStreamWebhook({
      rawBody,
      signatureHeader: streamSignatureHeader(rawBody),
      secret: STREAM_SECRET,
      accountId: 'test-account-id',
      apiKey: 'test-api-key',
      logger,
      fetchFn: streamFetchAnswering(STREAM_DOWNLOADS_ENABLED),
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
    expect(captured().extra).toMatchObject({ uid: STREAM_UID })
  })

  it('reports a downloads call the API refused', async () => {
    const result = await deliver({
      fetchFn: streamFetchAnswering({
        success: false,
        errors: [{ message: 'Video not ready yet' }],
      }),
    })

    expect(result.status).toBe(500)
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
    expect(captured().level).toBe('error')
    expect(captured().extra).toMatchObject({ uid: STREAM_UID, errors: 'Video not ready yet' })
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
    expect(capturedError().extra).toMatchObject({ uid: STREAM_UID })
  })

  it('reports a downloads response that did not match the schema', async () => {
    const result = await deliver({ fetchFn: streamFetchAnswering({ success: 'yes' }) })

    expect(result.status).toBe(500)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(capturedError().tags).toMatchObject(TAGS)
    expect(capturedError().extra).toMatchObject({ uid: STREAM_UID })
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
    expect(capturedError().extra).toMatchObject({ uid: STREAM_UID })
  })

  it('reports nothing for a signature it refuses — that is a caller, not an incident', async () => {
    const result = await handleStreamWebhook({
      rawBody: readyStreamPayload(),
      signatureHeader: null,
      secret: STREAM_SECRET,
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
          rawBody: JSON.stringify({ uid: STREAM_UID, status: { state: 'inprogress' } }),
        })
      ).status,
    ).toBe(200)

    expect(reported()).toBe(0)
  })
})

describe('a telemetry failure never reaches the caller', () => {
  /**
   * The guarantee every site above leans on: `capture` owns a never-throw body,
   * so no handler needs a `try` of its own around its own reporting.
   * `sentry-capture.spec.ts` pins that guard; this pins that a handler really is
   * behind it.
   */
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
})

/**
 * The six branches the adversarial review found after the first pass — same
 * root cause, four of them inside the ticket's own sweep.
 */
describe('GET /api/atlas/challenge, when it cannot render one', () => {
  const challengeRequest = (payload: Record<string, unknown>) =>
    ({ payload: { logger, ...payload }, query: { parent: 'https://partner.org' } }) as never

  it('reports a missing Turnstile site key', async () => {
    // The unit lane sets none, which is this branch (`vitest.config.mts`).
    const response = await atlasChallenge.handler(challengeRequest({}))

    expect(response.status).toBe(503)
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
    expect(captured().level).toBe('error')
    expect(captured().tags).toMatchObject(handlerTags('atlas/challenge'))
    expect(logger.error).toHaveBeenCalledWith({
      msg: 'atlasChallenge: TURNSTILE_SITE_KEY is not set',
    })
  })

  /** `serverEnv` parses at import, so a key has to be in place before the import. */
  const challengeWith = async (siteKey: string, over: Record<string, string> = {}) => {
    vi.stubEnv('TURNSTILE_SITE_KEY', siteKey)
    for (const [key, value] of Object.entries(over)) vi.stubEnv(key, value)
    vi.resetModules()
    return (await import('@/endpoints/atlas/challenge')).atlasChallenge
  }

  it('reports a production deployment carrying Cloudflare’s test key', async () => {
    const handler = await challengeWith('1x00000000000000000000AA', {
      RAILWAY_ENVIRONMENT_NAME: 'production',
    })

    const response = await handler.handler(challengeRequest({}))

    expect(response.status).toBe(503)
    expect(sentry.captureMessage).toHaveBeenCalledOnce()
    expect(captured().level).toBe('error')
    expect(captured().tags).toMatchObject(handlerTags('atlas/challenge'))
    vi.unstubAllEnvs()
  })

  it('reports an allowlist read that failed', async () => {
    const handler = await challengeWith('0x4AAAAAAAreal')
    const thrown = new Error('clients read failed')

    const response = await handler.handler(
      challengeRequest({ find: vi.fn().mockRejectedValue(thrown) }),
    )

    expect(response.status).toBe(503)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
    expect(capturedError().tags).toMatchObject(handlerTags('atlas/challenge'))
    vi.unstubAllEnvs()
  })

  it('reports nothing for a parent it refuses, which answers 403', async () => {
    const handler = await challengeWith('0x4AAAAAAAreal')

    const response = await handler.handler({
      payload: { logger },
      query: { parent: 'not-an-origin' },
    } as never)

    expect(response.status).toBe(403)
    expect(reported()).toBe(0)
    vi.unstubAllEnvs()
  })
})

describe('POST /api/users/:id/block, when the block cannot be saved', () => {
  const request = (error: unknown) =>
    ({
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ blocked: true, reason: 'spam' }),
      payload: {
        // `createLocalReq` reads these three off the config to build the
        // userless request this endpoint writes with.
        config: {
          i18n: {
            fallbackLanguage: 'en',
            supportedLanguages: { en: { dateFNSKey: 'en-US', translations: {} } },
          },
          localization: false,
        },
        db: {},
        logger,
        update: vi.fn().mockRejectedValue(error),
      },
      routeParams: { id: '42' },
      url: 'https://cloud.sydevelopers.com/api/users/42/block',
      user: { collection: 'managers', email: 'admin@example.org', id: 1, type: 'admin' },
    }) as never

  it('answers 500 and reports the exception once, naming the route', async () => {
    const thrown = new Error('deadlock detected')
    const response = await blockUser.handler(request(thrown))

    expect(response.status).toBe(500)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
    expect(capturedError().level).toBe('error')
    expect(capturedError().tags).toMatchObject(handlerTags('users/block'))
    expect(capturedError().extra).toMatchObject({ userId: 42 })
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('reports nothing when the registrant is simply gone, which answers 404', async () => {
    const response = await blockUser.handler(
      request(Object.assign(new Error('Not Found'), { status: 404 })),
    )

    expect(response.status).toBe(404)
    expect(reported()).toBe(0)
  })
})

describe('requestTranscript, when the replacement write fails', () => {
  const source = { relationTo: 'meditations', value: 3 } as never

  const request = (error: unknown) =>
    ({
      payload: {
        create: vi.fn().mockRejectedValue(error),
        db: {},
        delete: vi.fn().mockResolvedValue({ errors: [] }),
        find: vi.fn().mockResolvedValue({ docs: [] }),
        logger,
      },
    }) as never

  const ask = (error: unknown) =>
    requestTranscript(request(error), { source, audioFilename: 'talk.mp3', noun: 'meditation' })

  it('answers 500 and reports the exception once, naming the shared body', async () => {
    const thrown = new Error('connection terminated unexpectedly')
    const response = await ask(thrown)

    expect(response.status).toBe(500)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
    expect(capturedError().level).toBe('error')
    expect(capturedError().tags).toMatchObject(handlerTags('transcripts/request'))
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('reports nothing for a gate’s own refusal, which keeps its status', async () => {
    const response = await ask(new APIError('You may not transcribe this.', 403))

    expect(response.status).toBe(403)
    expect(reported()).toBe(0)
  })
})

describe('the R2 static handler, when the object cannot be read', () => {
  const adapterFor = (send: ReturnType<typeof vi.fn>) =>
    r2NativeAdapter({
      client: { send } as never,
      bucket: 'test-bucket',
      publicUrl: 'https://assets.example.test',
    })({ collection: { slug: 'imports' }, prefix: undefined } as never)

  const serve = (send: ReturnType<typeof vi.fn>) =>
    adapterFor(send).staticHandler(
      {} as never,
      {
        params: { collection: 'imports', filename: 'classes-ab12cd.csv' },
      } as never,
    )

  it('answers 500 and reports the exception once, naming the key', async () => {
    const thrown = new Error('socket hang up')
    const response = await serve(vi.fn().mockRejectedValue(thrown))

    expect(response.status).toBe(500)
    expect(sentry.captureException).toHaveBeenCalledOnce()
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
    expect(capturedError().tags).toMatchObject(handlerTags('r2/static'))
    expect(capturedError().extra).toMatchObject({ key: 'classes-ab12cd.csv' })
  })

  it('reports nothing for an object that is simply absent, which answers 404', async () => {
    const response = await serve(
      vi.fn().mockRejectedValue(Object.assign(new Error('no such key'), { name: 'NoSuchKey' })),
    )

    expect(response.status).toBe(404)
    expect(reported()).toBe(0)
  })
})
