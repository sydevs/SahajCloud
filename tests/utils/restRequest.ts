import type { createTestEnvironment } from './testHelpers'
import type { Payload } from 'payload'

import { handleEndpoints } from 'payload'

import { createSession } from '@/plugins/login'


type TestConfig = Awaited<ReturnType<typeof createTestEnvironment>>['config']

/**
 * Drive Payload's REAL REST pipeline from the integration lane.
 *
 * `handleEndpoints` is Payload's public entry point for the REST API — the same
 * function `@payloadcms/next`'s `REST_GET` calls, which is what
 * `src/app/(payload)/api/[...slug]/route.ts` mounts. Going through it is the
 * only way a test reaches `routeError`, and therefore the only way to observe
 * anything that lives there: root `afterError` hooks (`databaseErrorPlugin`),
 * and the `config.debug` redaction that decides what an error body discloses.
 *
 * The local API (`payload.find`, …) that every other integration spec uses
 * throws straight past all of it, which is why `database-cast-errors.int.spec.ts`
 * can only assert the mapper against a caught error and says so in its docblock.
 */
export interface RestRequestInit {
  method?: string
  /** JSON body. Serialized, with `Content-Type: application/json` set. */
  json?: unknown
}

export type RestClient = (
  path: string,
  init?: RestRequestInit,
) => Promise<{
  status: number
  body: Record<string, unknown>
  raw: string
  /** The response's own headers — a redirect's `Location` and `Set-Cookie`. */
  headers: Headers
}>

/** Build the Request `handleEndpoints` takes, with whatever auth header applies. */
function buildRequest(path: string, init: RestRequestInit | undefined, auth: HeadersInit) {
  const headers: Record<string, string> = { ...(auth as Record<string, string>) }
  if (init?.json !== undefined) headers['Content-Type'] = 'application/json'

  // No `path` override: it is documented as *"Override path from the request"*
  // and defaults to `new URL(req.url).pathname` (`handleEndpoints.js:106`),
  // which already excludes the query string. The query travels on the Request,
  // exactly as `REST_GET` passes it — which is the whole point for a spec whose
  // credential is a query parameter.
  return new Request(`http://localhost:3000${path}`, {
    method: init?.method ?? 'GET',
    headers,
    ...(init?.json === undefined ? {} : { body: JSON.stringify(init.json) }),
    redirect: 'manual',
  })
}

/**
 * Return a caller that issues authenticated REST requests against `config` as
 * `manager`.
 *
 * ⚠ The authentication is not incidental. Access control refuses an anonymous
 * read with **403 before any query runs**, so an unauthenticated request never
 * reaches Postgres and cannot produce the database errors these suites are
 * about. Managers built by `createTestEnvironment` and `testData.createManager`
 * are unverified, so `_verified` is set here — the JWT strategy's `_verified`
 * gate yields no user otherwise, and the request falls back to anonymous.
 */
export async function createRestClientAs(
  env: { payload: Payload; config: TestConfig },
  manager: { id: number | string },
): Promise<RestClient> {
  await env.payload.update({
    collection: 'managers',
    id: manager.id,
    data: { _verified: true },
  })

  const token = await createSession(env.payload, 'managers', manager.id)

  return createRestClientWithAuth(env, { Authorization: `JWT ${token}` })
}

/**
 * A caller with no credential at all.
 *
 * ⚠ Anonymous is a *property under test* here, not an oversight — the opposite
 * of `createRestClientAs`'s warning. An endpoint reachable without signing in
 * (`request-magic-link`, `redeem-magic-link`) must be exercised the way the internet
 * reaches it, and authenticating would hide exactly what the spec is asking.
 */
export function createAnonRestClient(env: { payload: Payload; config: TestConfig }): RestClient {
  return createRestClientWithAuth(env, {})
}

/** Also takes a cookie credential, which is what a magic-link redirect hands back. */
export function createRestClientWithAuth(
  env: { payload: Payload; config: TestConfig },
  auth: HeadersInit,
): RestClient {
  return async (path, init) => {
    const response = await handleEndpoints({
      config: env.config,
      request: buildRequest(path, init, auth),
    })

    const raw = await response.text()
    // A 302 carries no body, and a spec reading `Location` still wants the rest.
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    return { status: response.status, body, raw, headers: response.headers }
  }
}

/** The suite admin's REST client — the common case. */
export async function createRestClient(env: {
  payload: Payload
  config: TestConfig
  adminUser: { id: number | string }
}): Promise<RestClient> {
  return createRestClientAs(env, env.adminUser)
}

/**
 * A request that reaches Postgres and fails with something OTHER than a 22P02,
 * so `databaseErrorPlugin` does not rescue it and the `config.debug` redaction
 * is the only thing acting on the body. `limit` is passed through to the query
 * as a bigint, and this value overflows it.
 *
 * Measured, not assumed: with `debug: true` this answers 500 with drizzle's
 * `Failed query: select … from "meditations" … params: en,100000000000000000000`
 * plus a `stack`.
 */
export const FIVE_HUNDRED_PATH = '/api/meditations?limit=99999999999999999999'

/**
 * The live 22P02. `meditations.type` stores `lesson` and is labelled "Path", so
 * a caller reading the admin UI sends `path` — the exact production query behind
 * Sentry 126185460.
 */
export const CAST_FAILURE_PATH = '/api/meditations?where[type][equals]=path'
