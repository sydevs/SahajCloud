import type { Access, AccessArgs } from 'payload'

import { describe, expect, it } from 'vitest'

import { withUnlockAccess, withVersionHistoryAccess } from '@/plugins/access/accessConfigs'

/**
 * `readVersions` (#719) and `unlock` (#748) are DERIVED from `update`. Both bugs
 * shipped the same way: the key went unwritten, and Payload refilled it from its
 * collection defaults with `Boolean(user)` — which a published client's API key
 * satisfies. So the one branch that can leave the key unset must fail closed.
 *
 * `createAccessConfig` always assigns `update`, so that branch is unreachable
 * through `accessPlugin` today. It is reachable here, which is the point.
 */

const args = {} as AccessArgs

describe('withVersionHistoryAccess', () => {
  it('delegates readVersions to update', async () => {
    const wrapped = withVersionHistoryAccess({ update: (() => true) as Access })
    expect(await wrapped.readVersions!(args)).toBe(true)
  })

  it('keeps an explicit readVersions', () => {
    const readVersions = (() => 'explicit') as unknown as Access
    expect(withVersionHistoryAccess({ readVersions, update: (() => true) as Access }).readVersions)
      .toBe(readVersions)
  })

  it('denies when there is no update to delegate to', async () => {
    const wrapped = withVersionHistoryAccess<{ readVersions?: Access; update?: Access }>({})
    expect(wrapped.readVersions).toBeDefined()
    expect(await wrapped.readVersions!(args)).toBe(false)
  })
})

describe('withUnlockAccess', () => {
  it('delegates unlock to update, without the id', async () => {
    let seen: AccessArgs | undefined
    const wrapped = withUnlockAccess({
      update: ((a: AccessArgs) => {
        seen = a
        return true
      }) as Access,
    })
    expect(await wrapped.unlock!({ ...args, id: 7 })).toBe(true)
    expect(seen).not.toHaveProperty('id')
  })

  it('keeps an explicit unlock', () => {
    const unlock = (() => 'explicit') as unknown as Access
    expect(withUnlockAccess({ unlock, update: (() => true) as Access }).unlock).toBe(unlock)
  })

  it('denies when there is no update to delegate to', async () => {
    const wrapped = withUnlockAccess<{ unlock?: Access; update?: Access }>({})
    expect(wrapped.unlock).toBeDefined()
    expect(await wrapped.unlock!(args)).toBe(false)
  })
})
