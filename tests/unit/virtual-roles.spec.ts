import { describe, expect, it } from 'vitest'

import { bypassPermissions } from '@/plugins/access/bypassPermissions'
import { getRoleOptions, virtualRoles } from '@/plugins/access/config'
import { hasPermission } from '@/plugins/access/permissions'
import type { TypedAuthUser } from '@/plugins/access/types'

/**
 * The Atlas roles are derived from the `managedRegions` / `managedEvents`
 * joins, so nothing stores them and nothing can assign them.
 *
 * ⚠ **The fixtures below carry `roles: {}`** — an empty per-locale record, the
 * shape `hydrateLocalizedRoles` produces for a manager with no stored role —
 * because that is the whole point: a listed manager holds the role with
 * nothing written on their document. Verified against the real wiring rather
 * than assumed: `Managers.ts` declares both joins, Payload's JWT strategy
 * loads the user with `findByID` and no `joins: false`
 * (`payload/dist/auth/strategies/jwt.js`), and
 * `tests/int/role-based-access.int.spec.ts` asserts the joins really arrive on
 * a re-read manager.
 */
const manager = (overrides: Partial<TypedAuthUser> = {}): TypedAuthUser =>
  ({
    id: 1,
    collection: 'managers',
    type: 'manager',
    roles: {},
    ...overrides,
  }) as TypedAuthUser

const listedOnRegion = manager({ managedRegions: { docs: [3] } })
const assignedAnEvent = manager({ managedEvents: { docs: [9] } })

/**
 * ⚠ `locale` is passed through, never defaulted. A default parameter would
 * substitute `'en'` for the explicit `undefined` the `?locale=all` case is
 * about, and that case would then assert nothing.
 */
const may = (
  user: TypedAuthUser,
  collection: Parameters<typeof hasPermission>[0]['collection'],
  operation: Parameters<typeof hasPermission>[0]['operation'],
  locale: Parameters<typeof hasPermission>[0]['locale'],
) => hasPermission({ user, collection, operation, locale }, bypassPermissions)

describe('virtualRoles', () => {
  it('reads one role per non-empty join, and nothing from an empty one', () => {
    expect(virtualRoles({})).toEqual([])
    expect(virtualRoles({ managedRegions: { docs: [] }, managedEvents: {} })).toEqual([])
    expect(virtualRoles({ managedRegions: { docs: [3] } })).toEqual(['atlas-region-manager'])
    expect(virtualRoles({ managedEvents: { docs: [9] } })).toEqual(['atlas-event-manager'])
    expect(virtualRoles({ managedRegions: { docs: [3] }, managedEvents: { docs: [9] } })).toEqual([
      'atlas-region-manager',
      'atlas-event-manager',
    ])
  })
})

describe('getRoleOptions', () => {
  it('refuses a derived role, so no select can offer one', () => {
    expect(() => getRoleOptions(['atlas-region-manager'])).toThrow(/cannot be assigned/)
    expect(() => getRoleOptions(['atlas-event-manager'])).toThrow(/cannot be assigned/)
    expect(getRoleOptions(['web-translator'])).toEqual([
      { label: 'Web Translator', value: 'web-translator' },
    ])
  })
})

describe('a derived role in hasPermission', () => {
  it('grants a listed manager the region role with nothing stored', () => {
    expect(may(listedOnRegion, 'regions', 'create', 'en')).toBe(true)
    expect(may(listedOnRegion, 'events', 'delete', 'en')).toBe(true)
    expect(may(listedOnRegion, 'managers', 'read', 'en')).toBe(true)
    expect(may(listedOnRegion, 'imports', 'create', 'en')).toBe(true)
    expect(may(listedOnRegion, 'user-submissions', 'update', 'en')).toBe(true)
  })

  it('applies in every locale, since a listing names none', () => {
    expect(may(listedOnRegion, 'events', 'update', 'fr')).toBe(true)
    expect(may(listedOnRegion, 'events', 'update', 'cs')).toBe(true)
  })

  it('resolves nothing for ?locale=all, which names no locale to evaluate', () => {
    // `roleScopeFromLocale('all')` answers `undefined`, and a derived role must
    // not slip past that — it would grant every locale at once (#665).
    expect(may(listedOnRegion, 'events', 'update', undefined)).toBe(false)
    expect(may(assignedAnEvent, 'events', 'update', undefined)).toBe(false)
  })

  it('resolves for the union scope, which admin-UI nav visibility uses', () => {
    expect(may(listedOnRegion, 'events', 'update', 'union')).toBe(true)
    expect(may(assignedAnEvent, 'events', 'update', 'union')).toBe(true)
  })

  it('withdraws the role as soon as the listing is gone', () => {
    expect(may(manager({ managedRegions: { docs: [] } }), 'events', 'update', 'en')).toBe(false)
    expect(may(manager(), 'events', 'update', 'en')).toBe(false)
  })

  it('gives an event assignee their own events and no roster, import or region', () => {
    expect(may(assignedAnEvent, 'events', 'update', 'en')).toBe(true)
    expect(may(assignedAnEvent, 'events', 'delete', 'en')).toBe(true)
    expect(may(assignedAnEvent, 'user-submissions', 'read', 'en')).toBe(true)
    expect(may(assignedAnEvent, 'events', 'create', 'en')).toBe(false)
    expect(may(assignedAnEvent, 'regions', 'update', 'en')).toBe(false)
    expect(may(assignedAnEvent, 'managers', 'read', 'en')).toBe(false)
    expect(may(assignedAnEvent, 'imports', 'create', 'en')).toBe(false)
  })

  it('grants neither role a read of the registrants in `users`', () => {
    // Dead since registrations moved to `user-submissions` (#723). `users` is
    // restricted, so with no explicit grant nothing but an admin reaches it.
    expect(may(listedOnRegion, 'users', 'read', 'en')).toBe(false)
    expect(may(assignedAnEvent, 'users', 'read', 'en')).toBe(false)
  })

  it('reaches the Atlas project implicitly, as a stored role would', () => {
    expect(may(listedOnRegion, 'regions', 'read', 'en')).toBe(true)
    expect(may(assignedAnEvent, 'events', 'read', 'en')).toBe(true)
  })

  it('leaves a client untouched — its roles are flat and carry no join', () => {
    const client = {
      id: 2,
      collection: 'clients',
      _status: 'published',
      roles: ['sahaj-atlas-client'],
      managedRegions: { docs: [3] },
    } as unknown as TypedAuthUser
    expect(may(client, 'events', 'update', 'en')).toBe(false)
    expect(may(client, 'events', 'read', 'en')).toBe(true)
  })
})
