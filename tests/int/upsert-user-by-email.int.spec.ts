import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { commitTransaction, initTransaction } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { upsertUserByEmail } from '@/lib/users/upsertUserByEmail'

import { createTestEnvironment } from '../utils/testHelpers'

/**
 * The two halves of `upsertUserByEmail` that its callers' specs cannot reach.
 *
 * `tests/int/event-registration.int.spec.ts` covers the helper through the
 * register endpoint, but only ever on the paths a single sequential request
 * takes — the `findByEmail` hit and the plain insert. The conflict branch needs
 * two transactions running at once, and the field validation needs a caller
 * that is not an API client, so neither is reachable from there.
 */
describe('upsertUserByEmail', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  const bareReq = () => ({ payload }) as unknown as PayloadRequest

  async function userCount(email: string): Promise<number> {
    const { totalDocs } = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      overrideAccess: true,
      limit: 0,
    })
    return totalDocs
  }

  /**
   * Block until Postgres reports a backend **waiting on a lock** for this
   * suite's own `users` table, and fail rather than proceed if none appears.
   *
   * ⚠ **This replaces a fixed sleep, and the difference is the whole point of
   * the case below.** A delay only guarantees that A commits *late*; it says
   * nothing about where B got to. If B's `SELECT` is starved past A's commit it
   * takes the ordinary `findByEmail` hit, never inserts, and every assertion in
   * the case still passes — with `onConflictDoNothing`'s target deliberately
   * broken. That is the same vacuity the `Promise.all` draft had, reached by a
   * different route, and a quarter-second of event-loop starvation is not
   * exotic: `vitest.config.mts` runs this lane in up to 4 parallel forks.
   *
   * The suite's schema name is in the statement text, so a sibling fork blocked
   * on its own `users` table cannot satisfy this.
   */
  async function waitForBlockedInsert(timeoutMs = 15_000): Promise<void> {
    const adapter = payload.db as unknown as PostgresAdapter
    const deadline = Date.now() + timeoutMs
    do {
      const { rows } = await adapter.pool.query<{ waiting: number }>(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND datname = current_database() AND query LIKE $1`,
        [`%"${adapter.schemaName}"."users"%`],
      )
      if ((rows[0]?.waiting ?? 0) > 0) return
      await new Promise((resolve) => setTimeout(resolve, 25))
    } while (Date.now() < deadline)

    throw new Error(
      'upsertUserByEmail race: B never blocked on A’s uncommitted row, so the conflict branch was not exercised',
    )
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  /**
   * The `ON CONFLICT DO NOTHING` branch — the reason the helper stopped
   * catching a failed `create` (#673). Both requests read before either writes,
   * so both miss and both insert; the loser's statement returns no row rather
   * than raising, leaving its transaction intact for the re-read.
   *
   * ⚠ Watched failing at the site that causes it: pointing
   * `onConflictDoNothing` at a column other than `email` turns the loser's
   * insert into a unique violation and this case errors instead of resolving.
   * Dropping the `raced` re-read makes it throw the helper's own
   * "no row was found". Either way it is red, which is what says the branch is
   * genuinely traversed rather than skipped.
   */
  it('resolves to one row when two transactions insert the same email at once', async () => {
    const email = 'concurrent@example.com'

    // A inserts and does NOT commit, so its row is invisible to anyone else.
    const reqA = bareReq()
    await initTransaction(reqA)
    const idA = await upsertUserByEmail({ email, name: 'Racer One', req: reqA })

    // B's read therefore misses, and B's insert blocks on A's uncommitted row.
    // Not awaited: it cannot resolve until A commits, which is the interleave
    // this case exists to produce. `Promise.all` over two whole calls does not
    // produce it — A finishes outright and B takes the ordinary `findByEmail`
    // hit, which is why that first draft passed with the conflict target
    // deliberately broken.
    const reqB = bareReq()
    await initTransaction(reqB)
    const pendingB = upsertUserByEmail({ email, name: 'Racer Two', req: reqB })

    // Assert the interleave rather than hoping for it — see the helper.
    await waitForBlockedInsert()

    await commitTransaction(reqA)
    const idB = await pendingB
    await commitTransaction(reqB)

    expect(idB).toBe(idA)
    expect(await userCount(email)).toBe(1)

    // A won, so the row is A's — B resolved to it rather than overwriting it.
    const { docs } = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      overrideAccess: true,
    })
    expect(docs[0]?.name).toBe('Racer One')
  })

  /**
   * The Drizzle insert runs no Payload field validation, and the write guard
   * covers neither of these — it checks content, and only for a `clients`
   * caller. `prepareSubmission` forwards `submitterInfo.name` unchecked, so a
   * blank one reaching a bare `req` is the real shape of this.
   */
  it('refuses a blank name rather than storing a nameless registrant', async () => {
    const email = 'blank-name@example.com'

    await expect(
      upsertUserByEmail({ email, name: '   ', req: bareReq() }),
    ).rejects.toThrow(/name/i)
    expect(await userCount(email)).toBe(0)
  })

  it('refuses a malformed email rather than storing it', async () => {
    await expect(
      upsertUserByEmail({ email: 'not-an-email', name: 'Mal Formed', req: bareReq() }),
    ).rejects.toThrow(/email/i)
    expect(await userCount('not-an-email')).toBe(0)
  })

  it('normalizes the email before storing, and reuses the row on a second call', async () => {
    const first = await upsertUserByEmail({
      email: 'Mixed.Case@Example.com',
      name: 'Mixed Case',
      req: bareReq(),
    })
    const second = await upsertUserByEmail({
      email: 'mixed.case@example.com',
      name: 'Mixed Case Again',
      req: bareReq(),
    })

    expect(second).toBe(first)
    expect(await userCount('mixed.case@example.com')).toBe(1)
  })
})
