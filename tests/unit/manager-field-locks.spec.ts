/**
 * `selfOrAdminFieldAccess`, the lock on every `managers` field but the picker
 * title (#908). Which fields carry it is swept on the booted config in
 * `tests/int/managers-access.int.spec.ts`.
 */
import type { FieldAccessArgs, PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { selfOrAdminFieldAccess } from '@/plugins/access'

/** A non-admin manager — what `atlas-region-manager`'s pickers read as. */
const MANAGER = { collection: 'managers', id: 7, type: 'manager' }

describe('selfOrAdminFieldAccess', () => {
  const may = (user: unknown, args: Omit<FieldAccessArgs, 'req'> = {}) =>
    selfOrAdminFieldAccess({ ...args, req: { user } as PayloadRequest })

  it('allows an admin manager, whatever row it is asked about', async () => {
    const admin = { collection: 'managers', id: 1, type: 'admin' }
    expect(await may(admin, { id: 7 })).toBe(true)
    expect(await may(admin)).toBe(true)
  })

  it('allows the holder on their own row, by `id` and by `doc.id`', async () => {
    // `id` on a read, `doc.id` on a permissions check, and a REST id is a string.
    expect(await may(MANAGER, { id: 7 })).toBe(true)
    expect(await may(MANAGER, { doc: { id: 7 } })).toBe(true)
    expect(await may(MANAGER, { id: '7' })).toBe(true)
  })

  it('denies another row, and a row it cannot identify', async () => {
    expect(await may(MANAGER, { id: 8 })).toBe(false)
    expect(await may(MANAGER, { doc: { id: 8 } })).toBe(false)
    // A create, and the collection-level `/api/access`.
    expect(await may(MANAGER)).toBe(false)
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
