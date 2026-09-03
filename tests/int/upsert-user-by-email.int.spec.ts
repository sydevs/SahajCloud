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
    await new Promise((resolve) => setTimeout(resolve, 250))

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
