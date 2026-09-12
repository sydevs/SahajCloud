import type { Access, AccessArgs, Where } from 'payload'

import { describe, expect, it } from 'vitest'

import { withDerivedGrants } from '@/plugins/access/accessConfigs'

/**
 * `readVersions` (#719) and `unlock` (#748) are DERIVED from `update`. Both bugs
 * shipped the same way: the key went unwritten, and Payload refilled it from its
 * collection defaults with `Boolean(user)` — which a published client's API key
 * satisfies. So the one branch that can leave the key unset must fail closed.
 *
 * `createAccessConfig` always assigns `update`, so that branch is unreachable
 * through `accessPlugin` today. It is reachable here, which is the point.
 */

type DerivedAccess = { readVersions?: Access; unlock?: Access; update?: Access }

const args = {} as AccessArgs

const allow = (() => true) as Access
const scopeTo = (where: Where) => (() => where) as unknown as Access

describe('withDerivedGrants', () => {
  it('delegates every named grant to update', async () => {
    const wrapped = withDerivedGrants<DerivedAccess>({ update: allow }, ['readVersions', 'unlock'])
    expect(await wrapped.readVersions!(args)).toBe(true)
    expect(await wrapped.unlock!(args)).toBe(true)
  })

  it('derives only the keys it is asked for', () => {
    const wrapped = withDerivedGrants<DerivedAccess>({ update: allow }, ['readVersions'])
    expect(wrapped.readVersions).toBeDefined()
    // Globals have no `unlock`, so the globals call site asks for one key only.
    expect(wrapped.unlock).toBeUndefined()
  })

  it('keeps an explicit grant', () => {
    const readVersions = (() => 'explicit') as unknown as Access
    const unlock = (() => 'explicit') as unknown as Access
    const wrapped = withDerivedGrants({ readVersions, unlock, update: allow }, [
      'readVersions',
      'unlock',
    ])
    expect(wrapped.readVersions).toBe(readVersions)
    expect(wrapped.unlock).toBe(unlock)
  })

  it('drops the id before delegating', async () => {
    let seen: AccessArgs | undefined
    const update = ((a: AccessArgs) => {
      seen = a
      return true
    }) as Access
    const wrapped = withDerivedGrants<DerivedAccess>({ update }, ['readVersions', 'unlock'])

    expect(await wrapped.unlock!({ ...args, id: 7 })).toBe(true)
    expect(seen).not.toHaveProperty('id')

    seen = undefined
    expect(await wrapped.readVersions!({ ...args, id: 7 })).toBe(true)
    expect(seen).not.toHaveProperty('id')
  })

  it('translates a Where for readVersions and leaves unlock alone', async () => {
    const where: Where = { id: { in: [7] } }
    const wrapped = withDerivedGrants<DerivedAccess>({ update: scopeTo(where) }, [
      'readVersions',
      'unlock',
    ])

    // `appendVersionToQueryKey` remaps a document query onto version rows: a
    // document's own id is `parent` there, and its fields sit under `version.`.
    expect(await wrapped.readVersions!(args)).toEqual({ parent: { in: [7] } })
    // `unlock` queries the auth collection itself, so the Where passes through.
    expect(await wrapped.unlock!(args)).toEqual(where)
  })

  it('denies when there is no update to delegate to', async () => {
    const wrapped = withDerivedGrants<DerivedAccess>({}, ['readVersions', 'unlock'])
    expect(wrapped.readVersions).toBeDefined()
    expect(wrapped.unlock).toBeDefined()
    expect(await wrapped.readVersions!(args)).toBe(false)
    expect(await wrapped.unlock!(args)).toBe(false)
  })
})
