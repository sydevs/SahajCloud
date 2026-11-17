/**
 * A copy of `pg` whose pool keeps retrying a connection while Postgres wakes.
 *
 * A Railway service asleep under Serverless wakes on the first private-network
 * connection to it, and that connection is refused. `@payloadcms/db-postgres`
 * does not retry, so the request behind it fails.
 */
import pRetry from 'p-retry'

/**
 * The slice of `pg` this reads, typed structurally: the adapter's `pg` and
 * this app's resolve to different `@types/pg` versions, which do not assign.
 */
type PooledClient = { release: (release?: boolean | Error) => void }
type PoolConstructor = new (...args: unknown[]) => { connect(): Promise<PooledClient> }

type ConnectCallback = (
  err: Error | undefined,
  client: PooledClient | undefined,
  done: (release?: boolean | Error) => void,
) => void

/** Headroom over the few seconds a Railway Postgres takes to wake. */
const WAKE_BUDGET_MS = 30_000

const RETRY_INTERVAL_MS = 1_000

/**
 * The network errors a waking service answers with, plus `57P03`, Postgres's
 * own "the database system is starting up".
 */
const WAKE_CODES = new Set([
  '57P03',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
])

/**
 * `pg` raises these with no `code`: a socket closed mid-handshake, and a pool
 * or client attempt that outlived `connectionTimeoutMillis`.
 */
const WAKE_MESSAGES = /Connection terminated|timeout exceeded when trying to connect/

export const isPostgresWaking = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  const { code } = error as { code?: unknown }
  if (typeof code === 'string' && WAKE_CODES.has(code)) return true
  // Node's dual-stack connect rejects with one of these, holding a refusal per address.
  if (error instanceof AggregateError) return error.errors.some(isPostgresWaking)
  return WAKE_MESSAGES.test(error.message)
}

export type WakeRetryOptions = {
  budgetMs?: number
  intervalMs?: number
  /** Called once per connection, on its first failure that a wake explains. */
  onWaking?: (error: Error) => void
}

export const withWakeRetry = <Pg extends { Pool: object }>(
  base: Pg,
  { budgetMs = WAKE_BUDGET_MS, intervalMs = RETRY_INTERVAL_MS, onWaking }: WakeRetryOptions = {},
): Pg => {
  const connectWhileWaking = (connectOnce: () => Promise<PooledClient>) =>
    pRetry(connectOnce, {
      // The budget bounds the retrying, not a count, so `retries` must not.
      retries: Number.POSITIVE_INFINITY,
      maxRetryTime: budgetMs,
      // A wake takes as long whenever it is asked for, so the interval is flat.
      minTimeout: intervalMs,
      factor: 1,
      // ⚠ `onFailedAttempt` also runs on a failure nothing retries, so the log
      // owes the same test the retry decision makes.
      onFailedAttempt: ({ attemptNumber, error }) => {
        if (attemptNumber === 1 && isPostgresWaking(error)) onWaking?.(error)
      },
      shouldRetry: ({ error }) => isPostgresWaking(error),
    })

  class WakingPool extends (base.Pool as PoolConstructor) {
    connect(): Promise<PooledClient>
    connect(callback: ConnectCallback): void
    // ⚠ Both forms: the pool's own `query()`, which Drizzle calls, takes a
    // connection through `this.connect(callback)`.
    connect(callback?: ConnectCallback): Promise<PooledClient> | void {
      const connected = connectWhileWaking(() => super.connect())
      if (!callback) return connected
      connected.then(
        (client) => callback(undefined, client, client.release),
        (error: Error) => callback(error, undefined, () => {}),
      )
    }
  }

  return Object.assign(Object.create(base) as Pg, { Pool: WakingPool })
}
