import type { createTestEnvironment } from './testHelpers'
import type { Payload } from 'payload'

import { handleEndpoints } from 'payload'


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
}>

/**
 * Log `manager` in and return a caller that issues authenticated REST requests
 * against `config` as that manager.
 *
 * ⚠ The login is not incidental. Access control refuses an anonymous read with
 * **403 before any query runs**, so an unauthenticated request never reaches
 * Postgres and cannot produce the database errors these suites are about.
 * Managers built by `createTestEnvironment` and `testData.createManager` are
 * unverified, so `_verified` is set here — `payload.login` refuses otherwise
 * (`UnverifiedEmail`).
 */
export async function createRestClientAs(
  env: { payload: Payload; config: TestConfig },
  manager: { id: number | string; email: string },
  password = 'password123',
): Promise<RestClient> {
  await env.payload.update({
    collection: 'managers',
    id: manager.id,
    data: { _verified: true },
  })

  const { token } = await env.payload.login({
    collection: 'managers',
    data: { email: manager.email, password },
  })

  return async (path, init) => {
    const headers: Record<string, string> = { Authorization: `JWT ${token}` }
    if (init?.json !== undefined) headers['Content-Type'] = 'application/json'

    const response = await handleEndpoints({
      config: env.config,
      // No `path` override: it is documented as *"Override path from the
      // request"* and defaults to `new URL(req.url).pathname`
      // (`handleEndpoints.js:106`), which already excludes the query string.
      // The query travels on the Request, exactly as `REST_GET` passes it.
      request: new Request(`http://localhost:3000${path}`, {
        method: init?.method ?? 'GET',
        headers,
        ...(init?.json === undefined ? {} : { body: JSON.stringify(init.json) }),
      }),
    })

    const raw = await response.text()
    return { status: response.status, body: JSON.parse(raw) as Record<string, unknown>, raw }
  }
}

/** The suite admin's REST client — the common case. */
export async function createRestClient(env: {
  payload: Payload
  config: TestConfig
  adminUser: { id: number | string; email: string }
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
