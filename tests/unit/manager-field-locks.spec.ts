/**
 * Every field on `managers` carries a `read` lock, bar the picker's title
 * (#908).
 *
 * `atlas-manager` holds a collection-wide `managers: read` so the
 * `Events.manager` and `Regions.managers` pickers can list other managers
 * (#821). This sweep is what keeps `MANAGER_PUBLIC_FIELDS` the whole story:
 * a field added to the collection, or injected into it by `loginPlugin`,
 * fails here unless it is locked or named in that allowlist.
 *
 * ⚠ **Enumerated with Payload's own `flattenAllFields`, never a second copy of
 * the locker's walk.** Two agreeing implementations pass together when both are
 * wrong — and the walk is the half most likely to be wrong, since `collapsible`
 * and `row` splice their children up to the top level while an `array` keeps
 * its own.
 *
 * The collection is folded by hand, as `login-plugin.spec.ts` does: the plugin
 * is a pure function over a config, and this spec asserts the state *before*
 * `sanitizeConfig`, which is where the plugin's appended fields live.
 */
import type {
  CollectionConfig,
  Config,
  FieldAccessArgs,
  FlattenedField,
  PayloadRequest,
} from 'payload'

import { flattenAllFields } from 'payload'
import { describe, expect, it } from 'vitest'

import { MANAGER_PUBLIC_FIELDS } from '@/collections/Managers/access'
import { managersLogin } from '@/collections/Managers/login'
import { Managers } from '@/collections/Managers/Managers'
import { loginPlugin } from '@/plugins/login'
import { selfOrAdminFieldAccess } from '@/plugins/access'

const folded = (
  loginPlugin({ collections: [managersLogin] }) as (config: Config) => Config
)({ collections: [Managers] } as Config).collections?.[0] as CollectionConfig

const fields: FlattenedField[] = flattenAllFields({ fields: folded.fields })

const readLock = (field: FlattenedField): unknown =>
  (field as { access?: { read?: unknown } }).access?.read

describe('Managers field read locks', () => {
  describe('the sweep reaches what it claims to', () => {
    it('enumerates the collection, the plugin columns and the legacy collapsible', () => {
      // Non-vacuity first: an empty or shallow enumeration would make every
      // assertion below pass against a wide-open collection. `legacyData` sits
      // in a top-level `collapsible`, and the other four are appended or merged
      // outside the tabs.
      expect(fields.length).toBeGreaterThan(10)
      for (const name of [
        'magicLinkIssuedAt',
        'pendingInvitation',
        'invitationDueAt',
        'email',
        '_verified',
        'legacyData',
      ]) {
        expect(
          fields.map((field) => field.name),
          `${name} should be enumerated`,
        ).toContain(name)
      }
    })
  })

  it('locks every named field outside MANAGER_PUBLIC_FIELDS', () => {
    const unlocked = fields
      .filter((field) => !MANAGER_PUBLIC_FIELDS.has(field.name))
      .filter((field) => typeof readLock(field) !== 'function')
      .map((field) => field.name)

    expect(unlocked).toEqual([])
  })

  it('leaves the picker title readable', () => {
    const name = fields.find((field) => field.name === 'name')
    expect(name).toBeDefined()
    expect(readLock(name!)).toBeUndefined()
  })
})

describe('selfOrAdminFieldAccess', () => {
  const manager = { collection: 'managers', id: 7, type: 'manager' }
  const may = (user: unknown, args: Omit<FieldAccessArgs, 'req'> = {}) =>
    selfOrAdminFieldAccess({ ...args, req: { user } as PayloadRequest })

  it('allows an admin manager, whatever row it is asked about', async () => {
    const admin = { collection: 'managers', id: 1, type: 'admin' }
    expect(await may(admin, { id: 7 })).toBe(true)
    expect(await may(admin)).toBe(true)
  })

  it('allows the holder on their own row, by `id` and by `doc.id`', async () => {
    // `id` is the read path; `doc.id` is the permissions path — see the
    // predicate's own ⚠ for why both spellings arrive. A REST id is a string,
    // and must still match the numeric one on `req.user`.
    expect(await may(manager, { id: 7 })).toBe(true)
    expect(await may(manager, { doc: { id: 7 } })).toBe(true)
    expect(await may(manager, { id: '7' })).toBe(true)
  })

  it('denies another row, and a row it cannot identify', async () => {
    expect(await may(manager, { id: 8 })).toBe(false)
    expect(await may(manager, { doc: { id: 8 } })).toBe(false)
    // A create, and the collection-level `/api/access`.
    expect(await may(manager)).toBe(false)
  })

  it('denies an inactive manager, a client and an anonymous caller', async () => {
    for (const user of [
      { collection: 'managers', id: 7, type: 'inactive' },
      { collection: 'clients', id: 7 },
      null,
      undefined,
    ]) {
      expect(await may(user, { id: 7 })).toBe(false)
    }
  })
})
