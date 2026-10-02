import type { CollectionConfig, Config, GlobalConfig } from 'payload'

import { describe, expect, it } from 'vitest'

import { accessPlugin } from '@/plugins/access/accessPlugin'
import type { BypassPermissionFunction } from '@/plugins/access/types'
import { resolveHidden } from '@/plugins/access/visibility'

/**
 * `admin.hidden` on a global was REPLACED by the project rule, not composed
 * with it, so no global could hide itself from the admin menu — a collection
 * could, which is what made the gap invisible (#883). Both branches now call
 * one function, and this spec drives it twice: directly, and through
 * `accessPlugin` over a real config.
 *
 * ⚠ The second half is the one that matters. `resolveHidden` can be perfect
 * and still unreachable if a call site drops it, and a config transform is
 * exactly where that defect hides.
 */

/** Stands in for the admin bypass: every write permission granted. */
const allowAll: BypassPermissionFunction = () => 'allow'

/** An admin's own nav request — no project selected, so nothing is scoped out. */
const adminArgs = { user: { collection: 'managers', type: 'admin', currentProject: null } }

const collection = (slug: string, hidden?: CollectionConfig['admin']): CollectionConfig =>
  ({ slug, fields: [], admin: hidden }) as CollectionConfig

const global = (slug: string, admin?: GlobalConfig['admin']): GlobalConfig =>
  ({ slug, fields: [], admin }) as GlobalConfig

describe('resolveHidden', () => {
  it('keeps an explicit `true` rather than widening it to the project rule', () => {
    expect(resolveHidden(true, 'pages', allowAll)).toBe(true)
  })

  it('applies the project rule when nothing is declared', () => {
    const hidden = resolveHidden(undefined, 'pages', allowAll)
    expect(typeof hidden).toBe('function')
    expect((hidden as (a: typeof adminArgs) => boolean)(adminArgs)).toBe(false)
  })

  it('treats a declared `false` as no opinion, not as "always show me"', () => {
    // An entity that could opt OUT of project visibility would appear in the
    // nav of a project it has no place in.
    const hidden = resolveHidden(false, 'pages', allowAll)
    expect(typeof hidden).toBe('function')
    expect((hidden as (a: typeof adminArgs) => boolean)(adminArgs)).toBe(false)
  })

  it('ORs a declared function with the project rule', () => {
    const hidden = resolveHidden(() => true, 'pages', allowAll) as (a: typeof adminArgs) => boolean
    expect(hidden(adminArgs)).toBe(true)
  })

  it('still hides what the project rule hides when the declared function says no', () => {
    // No bypass, and the stub user holds no roles, so `hasAnyPermission` denies
    // every write and the project rule hides it.
    const hidden = resolveHidden(() => false, 'pages') as (a: typeof adminArgs) => boolean
    expect(hidden(adminArgs)).toBe(true)
  })

  it('hides an entity from a user that is absent', () => {
    const hidden = resolveHidden(undefined, 'pages', allowAll) as (a: {
      user: unknown
    }) => boolean
    expect(hidden({ user: null })).toBe(true)
  })
})

describe('accessPlugin wires that resolution into both branches', () => {
  const config = accessPlugin({ bypassPermissions: allowAll })({
    collections: [
      collection('pages'),
      collection('lecture-clips', { hidden: true }),
      collection('images', { hidden: () => true }),
    ],
    globals: [global('sahaja-glossary', { hidden: true }), global('sy-atlas-config')],
  } as unknown as Config) as Config

  const hiddenFor = (slug: string, kind: 'collections' | 'globals') =>
    config[kind]!.find((entity) => entity.slug === slug)!.admin!.hidden

  it('leaves a global declaring `hidden: true` hidden, admins included', () => {
    expect(hiddenFor('sahaja-glossary', 'globals')).toBe(true)
  })

  it('gives a global that declares nothing the project rule', () => {
    const hidden = hiddenFor('sy-atlas-config', 'globals')
    expect(typeof hidden).toBe('function')
    expect((hidden as (a: typeof adminArgs) => boolean)(adminArgs)).toBe(false)
  })

  it("leaves collections' existing behaviour unchanged", () => {
    expect(hiddenFor('lecture-clips', 'collections')).toBe(true)
    expect((hiddenFor('images', 'collections') as (a: typeof adminArgs) => boolean)(adminArgs)).toBe(
      true,
    )
    expect((hiddenFor('pages', 'collections') as (a: typeof adminArgs) => boolean)(adminArgs)).toBe(
      false,
    )
  })
})
