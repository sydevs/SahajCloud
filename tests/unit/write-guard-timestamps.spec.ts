import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { DEFAULT_WRITE_GUARD_POLICIES } from '@/plugins/writeGuard/policies'
import { writeGuardBeforeValidate } from '@/plugins/writeGuard/writeGuardPlugin'

/**
 * A client may not date its own row, and that is a fact about clients rather
 * than about one collection — so it is the guard's, for every collection and
 * operation the policy map names. It lived in `prepareUserSubmission`, where
 * the next client-writable collection would have had to remember it.
 *
 * The stakes: a backdated `createdAt` hides the row from the 24h spam history
 * and ages it into retention early.
 */
describe('the write guard’s timestamp strip', () => {
  const BACKDATED = '2020-01-01T00:00:00.000Z'

  const asClient = { headers: new Headers(), user: { collection: 'clients' } } as PayloadRequest
  const asManager = { headers: new Headers(), user: { collection: 'managers' } } as PayloadRequest

  /**
   * The real policies' checks are deliberately dropped: Turnstile is a network
   * call, and the strip is the subject here. What is taken from the map is the
   * set of collections and operations it opens, which is what must be covered.
   */
  const run = async (
    operation: 'create' | 'update',
    data: Record<string, unknown>,
    req: PayloadRequest = asClient,
  ) => {
    const hook = writeGuardBeforeValidate({ [operation]: {} })
    return (await hook({
      collection: {},
      data,
      operation,
      req,
    } as never)) as Record<string, unknown>
  }

  /** Every write the map opens to a client, so a new one inherits the strip. */
  const GUARDED_WRITES = Object.entries(DEFAULT_WRITE_GUARD_POLICIES).flatMap(([slug, policy]) =>
    (['create', 'update'] as const)
      .filter((operation) => policy?.[operation])
      .map((operation) => [slug, operation] as const),
  )

  it.each(GUARDED_WRITES)('drops both timestamps on a client %s %s', async (_slug, operation) => {
    const out = await run(operation, { createdAt: BACKDATED, updatedAt: BACKDATED, name: 'Mo' })

    expect(out).not.toHaveProperty('createdAt')
    expect(out).not.toHaveProperty('updatedAt')
    expect(out.name).toBe('Mo')
  })

  /**
   * Managers and jobs are trusted authors, and a seed or a migration
   * legitimately dates a row it is restoring.
   */
  it('leaves a manager’s own timestamps alone', async () => {
    const out = await run('create', { createdAt: BACKDATED }, asManager)
    expect(out.createdAt).toBe(BACKDATED)
  })

  /**
   * The escape hatch is for system-authored data carried on a client `req`, so
   * the strip stands down with the rest of the guard rather than outliving it.
   */
  it('stands down behind skipWriteGuard, like every other check', async () => {
    const hook = writeGuardBeforeValidate({ create: {} })
    const out = (await hook({
      collection: {},
      data: { createdAt: BACKDATED },
      operation: 'create',
      req: { ...asClient, context: { skipWriteGuard: true } },
    } as never)) as Record<string, unknown>

    expect(out.createdAt).toBe(BACKDATED)
  })
})
