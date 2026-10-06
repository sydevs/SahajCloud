/**
 * Every field on `managers` outside `MANAGER_PUBLIC_FIELDS` carries a `read`
 * lock (#828).
 *
 * ⚠ **`atlas-manager` reads this collection collection-wide** (#821) — a picker
 * has to list other managers, and a self-scoped `Where` would empty it. So the
 * narrowing is per field, and a field added without a lock leaks silently: it
 * appears in `GET /api/managers` for every region volunteer and breaks nothing.
 *
 * This is the gate that makes the allowlist in `src/collections/Managers/access.ts`
 * the whole story. It sweeps the collection as `loginPlugin` leaves it, so the
 * three fields that plugin injects are covered too. It does **not** replace
 * `tests/int/role-based-access.int.spec.ts`'s read-back: a lock present in the
 * config still has to deny the right caller, which only a real read answers.
 */
import type { CollectionConfig, Config } from 'payload'

import { flattenAllFields } from 'payload'
import { describe, expect, it } from 'vitest'

import { forceManagedTypeAndRoles, MANAGER_PUBLIC_FIELDS } from '@/collections/Managers/access'
import { managersLogin } from '@/collections/Managers/login'
import { Managers } from '@/collections/Managers/Managers'
import { loginPlugin } from '@/plugins/login'

/**
 * `managers` as the config carries it at boot: the collection plus what
 * `loginPlugin` injects. Payload's own auth fields arrive later, at
 * `sanitizeConfig` — `email` and `_verified` are declared in `Managers.ts` so
 * they are locked here rather than merged in unlocked.
 */
function wiredManagers(): CollectionConfig {
  const plugin = loginPlugin({ collections: [managersLogin] }) as (c: Config) => Config
  const folded = plugin({ collections: [Managers] } as Config)
  return (folded.collections as CollectionConfig[])[0]!
}

/**
 * Every field a read answers for, enumerated by **Payload**, not by a copy of
 * the locker's own walk.
 *
 * ⚠ That is the point: a sweep that re-implements the traversal passes whenever
 * the two agree, including when both are wrong. `flattenAllFields` is what
 * `stripLockedFieldsOnSelfRead` and `afterRead` resolve against — a named tab,
 * for one, is an entry of its own there and a container to the locker — so
 * checking against it is what makes a green run mean something.
 */
function namedFields(collection: CollectionConfig): { name: string; read: unknown }[] {
  return flattenAllFields({ fields: collection.fields }).map((field) => ({
    name: field.name,
    read: (field as { access?: { read?: unknown } }).access?.read,
  }))
}

describe('managers field read locks', () => {
  const fields = namedFields(wiredManagers())
  const names = fields.map((field) => field.name)

  it('sweeps the real collection, so a passing run means something', () => {
    // A fold that returned the collection untouched, or an import that resolved
    // to nothing, would make every assertion below vacuous.
    expect(names.length).toBeGreaterThan(10)
    expect(names).toContain('magicLinkIssuedAt')
    expect(names).toContain('pendingInvitation')
    expect(names).toContain('email')
    expect(names).toContain('_verified')
    expect(names).toContain('legacyData')
  })

  it('locks every field the allowlist does not name', () => {
    const unlocked = fields
      .filter((field) => !MANAGER_PUBLIC_FIELDS.has(field.name))
      .filter((field) => typeof field.read !== 'function')
      .map((field) => field.name)

    expect(unlocked).toEqual([])
  })

  it('leaves the allowlisted fields readable', () => {
    // The pickers suspend on this one. A lock here empties them instead.
    const name = fields.find((field) => field.name === 'name')
    expect(name?.read).toBeUndefined()
    expect([...MANAGER_PUBLIC_FIELDS]).toEqual(['name'])
  })
})

/**
 * ⚠ **A non-admin's create opens an account; it does not configure one.** With
 * `managers: create`, a coordinator could preset somebody else's notification
 * preferences (invitations: never) or a contact handle marked verified — enough
 * to silence their invitation or impersonate them.
 */
describe('forceManagedTypeAndRoles', () => {
  const run = (user: unknown, data: Record<string, unknown>) =>
    forceManagedTypeAndRoles({
      data,
      operation: 'create',
      req: { user } as never,
    } as never) as Record<string, unknown>

  const coordinator = { collection: 'managers', id: 4, type: 'manager' }
  const preset = {
    name: 'Anna',
    email: 'anna@example.org',
    type: 'admin',
    roles: { en: ['atlas-manager'] },
    language: 'de',
    currentProject: 'sahaj-atlas',
    notificationPreferences: { invitation: { frequency: 'Never' } },
    lastRegistrationDigestSentAt: '2026-01-01T00:00:00.000Z',
    legacyId: 9,
    legacyData: { x: 1 },
    contactDetails: [{ platform: 'whatsapp', identifier: '+49 1', verified: true }],
  }

  it('keeps the name, the address, the language and unverified handles, and nothing else', () => {
    expect(run(coordinator, preset)).toEqual({
      name: 'Anna',
      email: 'anna@example.org',
      language: 'de',
      contactDetails: [{ platform: 'whatsapp', identifier: '+49 1', verified: false }],
      roles: null,
      type: 'manager',
    })
  })

  it('leaves an admin’s create, and one with no user, as written', () => {
    const admin = { collection: 'managers', id: 1, type: 'admin' }
    expect(run(admin, preset)).toEqual(preset)
    expect(run(null, preset)).toEqual(preset)
  })
})
