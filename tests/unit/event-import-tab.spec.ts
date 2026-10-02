/**
 * Who the Import tab is offered to, and which regions it points at (#828).
 *
 * Two halves, because Payload splits them: `tab.condition` is handed no document
 * and must answer synchronously, so the capability lives there and the level
 * lives in the link. A spec per half, plus the one that matters most — that the
 * condition is the endpoint's own check rather than a second copy of it.
 */

import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { mayStageImport } from '@/collections/EventImports/capability'
import { PROPOSABLE_TARGET_LEVELS } from '@/collections/EventImports/propose/tree'
import { REGION_LEVEL_OPTIONS, Regions } from '@/collections/Regions/Regions'
import { importTabTarget } from '@/components/admin/RegionImport/tabTarget'

type User = Parameters<typeof mayStageImport>[0]['user']

const atlasManager = {
  collection: 'managers',
  id: 7,
  type: 'manager',
  roles: { de: ['atlas-manager'] },
} as unknown as User

const admin = { collection: 'managers', id: 1, type: 'admin' } as unknown as User

describe('mayStageImport', () => {
  it('admits a manager holding the role in the locale asked for', () => {
    expect(mayStageImport({ user: atlasManager, locale: 'de' })).toBe(true)
  })

  it('refuses the same manager under a locale they hold nothing in', () => {
    expect(mayStageImport({ user: atlasManager, locale: 'en' })).toBe(false)
  })

  it('refuses a request naming no locale, rather than falling back to the default', () => {
    expect(mayStageImport({ user: atlasManager, locale: undefined })).toBe(false)
  })

  it('admits an admin whatever the locale', () => {
    expect(mayStageImport({ user: admin, locale: 'en' })).toBe(true)
  })

  it('refuses an inactive manager', () => {
    const inactive = { ...(atlasManager as object), type: 'inactive' } as unknown as User
    expect(mayStageImport({ user: inactive, locale: 'de' })).toBe(false)
  })

  it('refuses nobody at all', () => {
    expect(mayStageImport({ user: null, locale: 'en' })).toBe(false)
  })

  /**
   * ⚠ An API client's `roles` is a flat array that answers every locale scope, so
   * the only thing between a published client holding `events: create` and a
   * staged batch is the collection check. The import is a person's action.
   */
  it('refuses an API client carrying the same grant', () => {
    const client = {
      collection: 'clients',
      id: 3,
      _status: 'published',
      roles: ['atlas-manager'],
    } as unknown as User
    expect(mayStageImport({ user: client, locale: 'de' })).toBe(false)
  })
})

describe('the Import tab registration on regions', () => {
  const view = (Regions.admin?.components?.views?.edit as Record<string, never> | undefined)?.import
  const registered = view as unknown as
    | {
        Component: string
        path: string
        tab: {
          Component: string
          condition: (args: { req: PayloadRequest }) => boolean
          order: number
        }
      }
    | undefined

  it('is mounted at /import with both components registered by path', () => {
    expect(registered?.path).toBe('/import')
    expect(registered?.Component).toBe('@/components/admin/RegionImport/ImportView')
    expect(registered?.tab.Component).toBe('@/components/admin/RegionImport/ImportTab')
  })

  /**
   * The condition cannot be a second reading of the grant: a tab offered where the
   * upload endpoint answers 403 is a volunteer filling in a CSV for nothing.
   */
  it('answers exactly what mayStageImport answers, caller by caller', () => {
    const condition = registered!.tab.condition
    for (const [user, locale] of [
      [atlasManager, 'de'],
      [atlasManager, 'en'],
      [admin, 'en'],
      [null, 'de'],
    ] as const) {
      const req = { user, locale } as unknown as PayloadRequest
      expect(condition({ req })).toBe(mayStageImport({ user, locale }))
    }
  })

  it('renders between Edit and Versions, which Payload orders at 100 and 300', () => {
    expect(registered!.tab.order).toBeGreaterThan(100)
    expect(registered!.tab.order).toBeLessThan(300)
  })
})

/**
 * ⚠ **A closed list, so a new region level forces a decision.** The tab hides on
 * exactly one of the four levels today. Add a fifth to `REGION_LEVEL_OPTIONS` and
 * this fails until someone says whether a batch may target it — silence would
 * otherwise mean "no", decided by nobody.
 */
describe('the levels a batch may target', () => {
  it('excludes venue, and nothing else', () => {
    const all = REGION_LEVEL_OPTIONS.map(({ value }) => value)
    const excluded = all.filter((level) => !PROPOSABLE_TARGET_LEVELS.includes(level as never))
    expect(excluded).toEqual(['venue'])
  })
})

describe('importTabTarget', () => {
  const base = {
    adminRoute: '/admin',
    collectionSlug: 'regions',
    id: 42,
    levels: PROPOSABLE_TARGET_LEVELS,
    locale: null,
    path: '/import',
  }

  it('points at the region being edited', () => {
    expect(importTabTarget({ ...base, level: 'country' })).toEqual({
      href: '/admin/collections/regions/42/import',
      hrefWithLocale: '/admin/collections/regions/42/import',
    })
  })

  it('carries the locale the editor is reading in, which the grant is scoped to', () => {
    expect(importTabTarget({ ...base, level: 'city', locale: 'de' })?.hrefWithLocale).toBe(
      '/admin/collections/regions/42/import?locale=de',
    )
  })

  it.each(PROPOSABLE_TARGET_LEVELS)('shows on a %s', (level) => {
    expect(importTabTarget({ ...base, level })).not.toBeNull()
  })

  it('hides on a venue', () => {
    expect(importTabTarget({ ...base, level: 'venue' })).toBeNull()
  })

  it('hides where there is no level to read, which the level list itself answers', () => {
    expect(importTabTarget({ ...base, level: null })).toBeNull()
  })

  it('hides on an unsaved document, which has no id to address', () => {
    expect(importTabTarget({ ...base, id: undefined, level: 'country' })).toBeNull()
  })

  it('honours a non-default admin route', () => {
    expect(importTabTarget({ ...base, adminRoute: '/cms', level: 'region' })?.href).toBe(
      '/cms/collections/regions/42/import',
    )
  })
})
