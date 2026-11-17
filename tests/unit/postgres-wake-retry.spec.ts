import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { DatabaseAdapterObj, Payload } from 'payload'
import type { PoolClient } from 'pg'

import { createServer } from 'node:net'

import { postgresAdapter } from '@payloadcms/db-postgres'
import pg from 'pg'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { retryWhilePostgresWakes } from '@/plugins/postgresWake'
import { isPostgresWaking, withWakeRetry } from '@/plugins/postgresWake/wakeRetry'

const withCode = (code: string, message = code): Error =>
  Object.assign(new Error(message), { code })

/** A `pg` whose pool fails its next connects with `failures`, then hands out `client`. */
const fakePg = (failures: Error[]) => {
  const client = { release: vi.fn() } as unknown as PoolClient
  let connects = 0
  class Pool {
    async connect(): Promise<PoolClient> {
      connects++
      const failure = failures.shift()
      if (failure) throw failure
      return client
    }
  }
  return { client, connects: () => connects, pg: { Pool } as unknown as typeof pg }
}

/** A loopback port nothing listens on, so a connect is refused at once. */
const closedPort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  await new Promise((resolve) => server.close(resolve))
  return port
}

describe('isPostgresWaking', () => {
  it.each(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P03'])('reads %s as a wake', (code) => {
    expect(isPostgresWaking(withCode(code))).toBe(true)
  })

  it('reads the driver messages that carry no code as a wake', () => {
    expect(isPostgresWaking(new Error('Connection terminated unexpectedly'))).toBe(true)
    expect(isPostgresWaking(new Error('timeout exceeded when trying to connect'))).toBe(true)
  })

  it('reads a dual-stack refusal by the errors it holds', () => {
    expect(isPostgresWaking(new AggregateError([withCode('ECONNREFUSED')]))).toBe(true)
  })

  it('leaves every other failure alone', () => {
    expect(isPostgresWaking(withCode('28P01', 'password authentication failed'))).toBe(false)
    expect(isPostgresWaking(new Error('syntax error'))).toBe(false)
    expect(isPostgresWaking('ECONNREFUSED')).toBe(false)
  })
})

describe('withWakeRetry', () => {
  const quick = { budgetMs: 1_000, intervalMs: 1 }

  it('connects once Postgres is up, reporting the wake once', async () => {
    const fake = fakePg([withCode('ECONNREFUSED'), withCode('57P03')])
    const onWaking = vi.fn()
    const pool = new (withWakeRetry(fake.pg, { ...quick, onWaking }).Pool)()

    await expect(pool.connect()).resolves.toBe(fake.client)
    expect(fake.connects()).toBe(3)
    expect(onWaking).toHaveBeenCalledOnce()
  })

  it('retries the callback form too, handing back a release', async () => {
    const fake = fakePg([withCode('ECONNREFUSED')])
    const pool = new (withWakeRetry(fake.pg, quick).Pool)()

    const [err, client, done] = await new Promise<Parameters<Parameters<pg.Pool['connect']>[0]>>(
      (resolve) => pool.connect((...args) => resolve(args)),
    )
    expect(err).toBeUndefined()
    expect(client).toBe(fake.client)
    expect(done).toBe(fake.client.release)
  })

  it('fails at once on an error a wake does not explain', async () => {
    const failure = withCode('28P01', 'password authentication failed')
    const fake = fakePg([failure])
    const pool = new (withWakeRetry(fake.pg, quick).Pool)()

    await expect(pool.connect()).rejects.toBe(failure)
    expect(fake.connects()).toBe(1)
  })

  it('gives up with the last refusal once the budget is spent', async () => {
    const fake = fakePg(Array.from({ length: 1_000 }, () => withCode('ECONNREFUSED')))
    const pool = new (withWakeRetry(fake.pg, { budgetMs: 30, intervalMs: 5 }).Pool)()

    await expect(pool.connect()).rejects.toMatchObject({ code: 'ECONNREFUSED' })
    expect(fake.connects()).toBeGreaterThan(1)
  })

  it("retries a real pool's query(), which connects through the callback form", async () => {
    const onWaking = vi.fn()
    const pool = new (withWakeRetry(pg, { budgetMs: 200, intervalMs: 20, onWaking }).Pool)({
      host: '127.0.0.1',
      port: await closedPort(),
    })
    const started = Date.now()

    await expect(pool.query('SELECT 1')).rejects.toSatisfy(isPostgresWaking)
    expect(onWaking).toHaveBeenCalledOnce()
    expect(Date.now() - started).toBeGreaterThanOrEqual(200)
    await pool.end()
  })
})

/**
 * The adapter builds its pool inside its own `connect()`, from the `pg` that
 * `init` left on it. Nothing in the adapter's types says so, so this drives the
 * real adapter at a refused port: the seam the wrapper hangs on either carries
 * the retry or it does not, with no sleeping Postgres needed to find out.
 */
describe("the adapter's own connect path", () => {
  it('builds its pool from the pg that init left, and retries through it', async () => {
    const onWaking = vi.fn()
    const logger = { error: vi.fn(), info: vi.fn() }
    const adapter = postgresAdapter({
      pool: { host: '127.0.0.1', port: await closedPort() },
    })

    const db = adapter.init({ payload: { logger } as unknown as Payload })
    expect(db.pool).toBeUndefined()
    db.pg = withWakeRetry(db.pg, { budgetMs: 300, intervalMs: 20, onWaking })
    // `connect()`'s own failure path rejects this, which nothing else awaits.
    db.initializing.catch(() => {})
    const started = Date.now()

    // `connect` is optional on Payload's adapter type; this seam is it being there.
    expect(db.connect).toBeInstanceOf(Function)
    await expect(db.connect?.()).rejects.toThrow(/cannot connect to Postgres/)
    expect(onWaking).toHaveBeenCalledOnce()
    expect(Date.now() - started).toBeGreaterThanOrEqual(300)
    await db.pool?.end()
  })
})

describe('retryWhilePostgresWakes', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const inRailwayEnvironment = (name: string | undefined): void => {
    vi.stubEnv('RAILWAY_ENVIRONMENT', undefined)
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', name)
  }

  const fakeAdapter = () => {
    const { pg: basePg } = fakePg([])
    const adapter = {
      name: 'postgres',
      defaultIDType: 'number',
      init: () => ({ pg: basePg }) as unknown as PostgresAdapter,
    } as unknown as DatabaseAdapterObj<PostgresAdapter>
    return { adapter, basePg }
  }

  it("wraps the adapter's own pg on a PR preview", () => {
    inRailwayEnvironment('SahajCloud-pr-1180')
    const { adapter, basePg } = fakeAdapter()

    const db = retryWhilePostgresWakes(adapter).init({ payload: {} as Payload })
    expect(db.pg).not.toBe(basePg)
    expect(Object.getPrototypeOf(db.pg.Pool)).toBe(basePg.Pool)
  })

  it.each([['production'], ['staging'], [undefined]])(
    'leaves the adapter untouched in %s',
    (name) => {
      inRailwayEnvironment(name)
      const { adapter } = fakeAdapter()

      expect(retryWhilePostgresWakes(adapter)).toBe(adapter)
    },
  )
})
