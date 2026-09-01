/**
 * The wiring, not the behaviour
 *
 * `withLocalizedRoleAuth` decides WHICH collections get the auth strategy and
 * the three auth-response hooks. That decision moved out of `Managers.ts` (an
 * explicit list of four wiring points) and into a predicate over the collection
 * config — which is more robust but also silent: a predicate that stops matching
 * takes the whole of #665's fix offline and no behavioural test in this lane
 * would notice, because nothing in this lane authenticates.
 *
 * The integration lane covers what the strategy DOES (`role-based-access.int.spec.ts`
 * authenticates for real). These cover only that it is attached at all, and to
 * the right collections.
 */

import type { CollectionConfig } from 'payload'

import { describe, it, expect } from 'vitest'

import { withLocalizedRoleAuth } from '../../src/plugins/access/localizedRolesAuth'

/** An auth collection with a localized `roles` field — the shape `Managers` has. */
const managersLike: CollectionConfig = {
  slug: 'managers',
  auth: { maxLoginAttempts: 5 },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'roles', type: 'select', hasMany: true, localized: true, options: ['a'] },
  ],
}

/** An auth collection whose `roles` is flat — the shape `Clients` has. */
const clientsLike: CollectionConfig = {
  slug: 'clients',
  auth: true,
  fields: [{ name: 'roles', type: 'select', hasMany: true, options: ['a'] }],
}

describe('withLocalizedRoleAuth', () => {
  it('attaches the strategy and all three auth-response hooks to a localized-roles auth collection', () => {
    const result = withLocalizedRoleAuth(managersLike)
    const auth = result.auth as { strategies?: { name: string }[] }

    expect(auth.strategies?.map((s) => s.name)).toEqual(['localized-roles'])
    expect(result.hooks?.afterLogin).toHaveLength(1)
    expect(result.hooks?.afterMe).toHaveLength(1)
    expect(result.hooks?.afterRefresh).toHaveLength(1)
  })

  it('leaves an auth collection whose roles are NOT localized untouched', () => {
    // `Clients.roles` is deliberately flat, so there is nothing to hydrate and
    // the strategy would only add a pointless read to every client request.
    expect(withLocalizedRoleAuth(clientsLike)).toBe(clientsLike)
  })

  it('leaves a non-auth collection untouched', () => {
    const pages: CollectionConfig = {
      slug: 'pages',
      fields: [{ name: 'roles', type: 'text', localized: true }],
    }
    expect(withLocalizedRoleAuth(pages)).toBe(pages)
  })

  it('preserves strategies and hooks the collection configured for itself', () => {
    // It appends. A collection that adds its own `afterLogin` must keep it —
    // silently dropping one would be an access-adjacent regression.
    const ownHook = async () => undefined
    const ownStrategy = { name: 'mine', authenticate: async () => ({ user: null }) }
    const result = withLocalizedRoleAuth({
      ...managersLike,
      auth: { ...(managersLike.auth as object), strategies: [ownStrategy] },
      hooks: { afterLogin: [ownHook] },
    })
    const auth = result.auth as { strategies?: { name: string }[] }

    expect(auth.strategies?.map((s) => s.name)).toEqual(['mine', 'localized-roles'])
    expect(result.hooks?.afterLogin).toHaveLength(2)
    expect(result.hooks?.afterLogin?.[0]).toBe(ownHook)
  })
})
