/**
 * The deferral gate on both write-time cache invalidations (#828, phase 6c).
 *
 * ⚠ **This is the only place the gate is assertable.** A bulk commit's own spec
 * cannot see either invalidation: the Cloudflare purge is inert without
 * credentials, and `revalidateTag` throws outside a Next request scope and is
 * swallowed on purpose. Here both are driven directly, so "deferred" and "not
 * deferred" are two observable outcomes rather than two silent ones.
 *
 * ⚠ **The hook fires and forgets, so every assertion awaits a tick.**
 * `cachePlugin` voids the purge promise rather than returning it, which is what
 * keeps a failed purge from failing the write.
 */

import type { Config } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  serverEnv: { CLOUDFLARE_ZONE_ID: 'zone123', CLOUDFLARE_CACHE_PURGE_TOKEN: 'token-abc' },
}))

const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }))

import { commitWriteReq } from '@/collections/EventImports/commit/scope'
import { revalidateAtlasSidebarHook } from '@/lib/atlasSidebar/cache'
import { cachePlugin } from '@/plugins/cache'
import { DEFER_CACHE_INVALIDATION, defersCacheInvalidation } from '@/plugins/cache/defer'
import { SKIP_INVITATIONS } from '@/plugins/login'

const deferred = { [DEFER_CACHE_INVALIDATION]: true }

/** The hooks `cachePlugin` attaches to a cacheable collection. */
function hooksFor(slug: string) {
  const result = cachePlugin({
    collections: [{ slug, fields: [] }],
  } as unknown as Config)
  const hooks = result.collections?.[0]?.hooks
  return {
    afterChange: hooks?.afterChange?.at(-1),
    afterDelete: hooks?.afterDelete?.at(-1),
  }
}

describe('defersCacheInvalidation', () => {
  it('reads only an explicit true', () => {
    expect(defersCacheInvalidation(deferred)).toBe(true)
    expect(defersCacheInvalidation({ [DEFER_CACHE_INVALIDATION]: 'yes' })).toBe(false)
    expect(defersCacheInvalidation({})).toBe(false)
    expect(defersCacheInvalidation(undefined)).toBe(false)
    expect(defersCacheInvalidation(null)).toBe(false)
  })
})

/**
 * ⚠ **The gate above is half the contract; this is the other half.** A commit
 * that stopped declaring the deferral would purge once per class again, and
 * every assertion in this file would still pass.
 */
describe('the commit’s write request', () => {
  it('declares the deferral, and carries no memo from the caller', () => {
    const req = { context: { someMemo: ['a region'] }, user: { id: 7 } }

    const write = commitWriteReq(req as never)

    expect(defersCacheInvalidation(write.context)).toBe(true)
    expect(write.context).toEqual({ ...deferred, [SKIP_INVITATIONS]: true })
    expect(write.user).toBe(req.user)
  })

  /**
   * Naming a class's coordinator queues them an invitation, so the import's own
   * writes mail nobody unless the reviewer opted in for the batch.
   */
  it('suppresses coordinator invitations unless the reviewer opted in', () => {
    const req = { context: {}, user: { id: 7 } }
    expect(commitWriteReq(req as never).context[SKIP_INVITATIONS]).toBe(true)
    expect(
      commitWriteReq(req as never, { inviteCoordinators: true }).context[SKIP_INVITATIONS],
    ).toBe(false)
  })
})

describe('the Cloudflare purge on write', () => {
  const fetchFn = vi.fn()
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
  const doc = { id: 1 }

  beforeEach(() => {
    vi.clearAllMocks()
    fetchFn.mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchFn)
  })

  const args = (context: Record<string, unknown>) =>
    ({ context, doc, req: { payload: { logger } } }) as never

  it('purges the collection’s tag on a change and a delete', async () => {
    const { afterChange, afterDelete } = hooksFor('events')

    await afterChange?.(args({}))
    await afterDelete?.(args({}))
    await Promise.resolve()

    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({ tags: ['events'] })
  })

  it('purges nothing while the caller is deferring', async () => {
    const { afterChange, afterDelete } = hooksFor('events')

    await afterChange?.(args(deferred))
    await afterDelete?.(args(deferred))
    await Promise.resolve()

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns the document either way, so no write is changed', async () => {
    const { afterChange } = hooksFor('regions')

    expect(await afterChange?.(args(deferred))).toBe(doc)
    expect(await afterChange?.(args({}))).toBe(doc)
  })
})

describe('the Atlas sidebar bust on write', () => {
  beforeEach(() => {
    revalidateTag.mockClear()
  })

  it('busts the tag by default', () => {
    revalidateAtlasSidebarHook({ context: {} })

    expect(revalidateTag).toHaveBeenCalledWith('atlas-sidebar', 'max')
  })

  it('busts nothing while the caller is deferring', () => {
    revalidateAtlasSidebarHook({ context: deferred })

    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('still busts the tag for a caller that passes no context at all', () => {
    revalidateAtlasSidebarHook()

    expect(revalidateTag).toHaveBeenCalledTimes(1)
  })
})
