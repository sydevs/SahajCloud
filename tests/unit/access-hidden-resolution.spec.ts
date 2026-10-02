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

/** Invoke a resolved `hidden`, asserting it is a function rather than a boolean. */
const ask = (hidden: unknown): boolean => {
  expect(typeof hidden).toBe('function')
  return (hidden as (args: typeof adminArgs) => boolean)(adminArgs)
}

const entity = <T>(slug: string, admin?: unknown): T => ({ slug, fields: [], admin }) as T

describe('resolveHidden', () => {
  it('keeps an explicit `true` rather than widening it to the project rule', () => {
    expect(resolveHidden(true, 'pages', allowAll)).toBe(true)
  })

  it('applies the project rule when nothing is declared', () => {
    expect(ask(resolveHidden(undefined, 'pages', allowAll))).toBe(false)
  })

  it('treats a declared `false` as no opinion, not as "always show me"', () => {
    // An entity that could opt OUT of project visibility would appear in the
    // nav of a project it has no place in.
    expect(ask(resolveHidden(false, 'pages', allowAll))).toBe(false)
  })

  it('ORs a declared function with the project rule', () => {
    expect(ask(resolveHidden(() => true, 'pages', allowAll))).toBe(true)
  })

  it('still hides what the project rule hides when the declared function says no', () => {
    // No bypass, and the stub user holds no roles, so `hasAnyPermission` denies
    // every write and the project rule hides it.
    expect(ask(resolveHidden(() => false, 'pages'))).toBe(true)
  })
})

describe('accessPlugin wires that resolution into both branches', () => {
  const config = accessPlugin({ bypassPermissions: allowAll })({
    collections: [
      entity<CollectionConfig>('pages'),
      entity<CollectionConfig>('lecture-clips', { hidden: true }),
      entity<CollectionConfig>('images', { hidden: () => true }),
    ],
    globals: [
      entity<GlobalConfig>('sahaja-glossary', { hidden: true }),
      entity<GlobalConfig>('sy-atlas-config'),
    ],
  } as unknown as Config) as Config

  const hiddenFor = (kind: 'collections' | 'globals', slug: string) =>
    config[kind]!.find((registered) => registered.slug === slug)!.admin!.hidden

  it('leaves a global declaring `hidden: true` hidden, admins included', () => {
    expect(hiddenFor('globals', 'sahaja-glossary')).toBe(true)
  })

  it('gives a global that declares nothing the project rule', () => {
    expect(ask(hiddenFor('globals', 'sy-atlas-config'))).toBe(false)
  })

  it("leaves collections' existing behaviour unchanged", () => {
    expect(hiddenFor('collections', 'lecture-clips')).toBe(true)
    expect(ask(hiddenFor('collections', 'images'))).toBe(true)
    expect(ask(hiddenFor('collections', 'pages'))).toBe(false)
  })
})
