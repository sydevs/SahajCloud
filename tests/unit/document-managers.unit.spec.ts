import type { FlattenedField, Payload, PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  getDocManagerFields,
  hasDocManagerAccess,
  resolveManagedDocIds,
  userManagesDocument,
} from '@/plugins/access/documentManagers'

/** Build a mock payload exposing only the `flattenedFields` the introspection reads. */
function payloadWithFields(collection: string, fields: Partial<FlattenedField>[]): Payload {
  return {
    collections: { [collection]: { config: { flattenedFields: fields } } },
  } as unknown as Payload
}

const managersHasMany: Partial<FlattenedField> = {
  type: 'relationship',
  name: 'managers',
  relationTo: 'managers',
  hasMany: true,
}
const managerSingle: Partial<FlattenedField> = {
  type: 'relationship',
  name: 'manager',
  relationTo: 'managers',
  hasMany: false,
}
const selfParent = (collection: string): Partial<FlattenedField> => ({
  type: 'relationship',
  name: 'parent',
  relationTo: collection,
})
const breadcrumbs: Partial<FlattenedField> = { type: 'array', name: 'breadcrumbs' }

describe('getDocManagerFields', () => {
  it('detects the full Regions shape: managers + self parent + breadcrumbs', () => {
    const fields = getDocManagerFields(
      payloadWithFields('regions', [managersHasMany, selfParent('regions'), breadcrumbs]),
      'regions',
    )
    expect(fields).toEqual({
      managersField: 'managers',
      managerField: null,
      parentField: 'parent',
      hasBreadcrumbs: true,
    })
    expect(hasDocManagerAccess(fields)).toBe(true)
  })

  it('detects a flat managers field (Pages shape) with no parent/breadcrumbs', () => {
    const fields = getDocManagerFields(payloadWithFields('pages', [managersHasMany]), 'pages')
    expect(fields.managersField).toBe('managers')
    expect(fields.parentField).toBeNull()
    expect(fields.hasBreadcrumbs).toBe(false)
    expect(hasDocManagerAccess(fields)).toBe(true)
  })

  it('detects a single `manager` relationship', () => {
    const fields = getDocManagerFields(payloadWithFields('events', [managerSingle]), 'events')
    expect(fields.managerField).toBe('manager')
    expect(fields.managersField).toBeNull()
    expect(hasDocManagerAccess(fields)).toBe(true)
  })

  it('ignores relationships that do not match the name + target convention', () => {
    const fields = getDocManagerFields(
      payloadWithFields('clients', [
        // relationship to managers but a different name → not a grant field
        { type: 'relationship', name: 'primaryContact', relationTo: 'managers', hasMany: false },
        // named `managers` but pointing at another collection → not a grant field
        { type: 'relationship', name: 'managers', relationTo: 'regions', hasMany: true },
        // `parent` pointing at a different collection (not self-referential)
        { type: 'relationship', name: 'parent', relationTo: 'regions' },
        // unrelated relationship
        { type: 'relationship', name: 'author', relationTo: 'authors' },
      ]),
      'clients',
    )
    expect(fields).toEqual({
      managersField: null,
      managerField: null,
      parentField: null,
      hasBreadcrumbs: false,
    })
    expect(hasDocManagerAccess(fields)).toBe(false)
  })

  it('matches a polymorphic relationTo array that includes managers', () => {
    const fields = getDocManagerFields(
      payloadWithFields('things', [
        { type: 'relationship', name: 'manager', relationTo: ['managers', 'clients'] },
      ]),
      'things',
    )
    expect(fields.managerField).toBe('manager')
  })

  it('returns no fields for globals / unknown collections (no flattenedFields)', () => {
    const fields = getDocManagerFields({ collections: {} } as unknown as Payload, 'wm-app-config')
    expect(hasDocManagerAccess(fields)).toBe(false)
  })
})

describe('parent-walk fallback (no breadcrumbs) terminates on cycles', () => {
  const parentFields = {
    managersField: 'managers',
    managerField: null,
    parentField: 'parent',
    hasBreadcrumbs: false,
  }

  it('resolveManagedDocIds stops when a descendant chain loops back', async () => {
    // Roots: [1]. Children of 1 → 2. Children of 2 → 1 (visited) + 2 (self) → loop.
    const req = {
      payload: {
        find: async ({ where }: { where: Record<string, any> }) => {
          if (where.or) return { docs: [{ id: 1 }] }
          const ids: number[] = where.parent?.in ?? []
          if (ids.includes(1)) return { docs: [{ id: 2 }] }
          if (ids.includes(2)) return { docs: [{ id: 1 }, { id: 2 }] }
          return { docs: [] }
        },
      },
    } as unknown as PayloadRequest

    const ids = await resolveManagedDocIds(req, 'things', 99, parentFields)
    expect(ids.sort()).toEqual([1, 2])
  })

  it('userManagesDocument stops walking up a cyclic parent chain', async () => {
    // 3 → parent 4 → parent 3 → … ; neither lists the user.
    const req = {
      payload: {
        findByID: async ({ id }: { id: number }) => {
          if (id === 3) return { id: 3, parent: 4, managers: [] }
          if (id === 4) return { id: 4, parent: 3, managers: [] }
          return null
        },
      },
    } as unknown as PayloadRequest

    await expect(userManagesDocument(req, 'things', 99, 3, parentFields)).resolves.toBe(false)
  })

  it('userManagesDocument finds the user on an ancestor via the parent walk', async () => {
    // 5 → parent 6 (lists user 99). 6 → no parent.
    const req = {
      payload: {
        findByID: async ({ id }: { id: number }) => {
          if (id === 5) return { id: 5, parent: 6, managers: [] }
          if (id === 6) return { id: 6, parent: null, managers: [99] }
          return null
        },
      },
    } as unknown as PayloadRequest

    await expect(userManagesDocument(req, 'things', 99, 5, parentFields)).resolves.toBe(true)
  })
})
