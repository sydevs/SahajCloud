/**
 * `loginPlugin`'s wiring (#837, #847).
 *
 * The property under test is **which collections the plugin touches, and what
 * it does to the ones it leaves alone**. Every failure here is silent at
 * runtime: a replaced `endpoints` array deletes the project switcher, a missed
 * collection produces a 404 nobody reads as a config bug, and a slug nobody
 * declared would take the whole config down at boot if it threw.
 *
 * Folded by hand rather than by booting Payload — the plugin is a pure function
 * over a config, and it runs *before* `sanitizeConfig`, which is the state these
 * assertions have to reproduce (`endpoints` still `undefined`).
 */
import type { CollectionConfig, Config, Endpoint, Plugin } from 'payload'

import { describe, expect, it } from 'vitest'

import { loginPlugin, type LoginCollectionConfig } from '@/plugins/login'

const managers: LoginCollectionConfig = { slug: 'managers' }

const setProject: Endpoint = { path: '/set-project', method: 'post', handler: () => new Response() }

/** A collection as a plugin sees it: pre-`sanitizeConfig`. */
function collection(slug: string, endpoints?: Endpoint[]): CollectionConfig {
  return { slug, fields: [{ name: 'email', type: 'email' }], ...(endpoints ? { endpoints } : {}) }
}

function fold(plugin: Plugin, ...collections: CollectionConfig[]): CollectionConfig[] {
  const folded = (plugin as (config: Config) => Config)({ collections } as Config)
  return folded.collections as CollectionConfig[]
}

const paths = (c: CollectionConfig) => (c.endpoints || []).map((e) => (e as Endpoint).path)
const fieldNames = (c: CollectionConfig) => c.fields.map((f) => ('name' in f ? f.name : null))

describe('loginPlugin', () => {
  it('adds the field and both endpoints to a configured collection', () => {
    const [wired] = fold(loginPlugin({ collections: [managers] }), collection('managers'))

    expect(fieldNames(wired)).toContain('magicLinkIssuedAt')
    expect(paths(wired)).toEqual(['/request-link', '/consume-link'])
  })

  it('appends to the endpoints a collection already declares', () => {
    // `Managers` declares `[setProject]`. Replacing rather than appending
    // deletes the Current Project switcher, and nothing else would say so.
    const [wired] = fold(
      loginPlugin({ collections: [managers] }),
      collection('managers', [setProject]),
    )

    expect(paths(wired)).toEqual(['/set-project', '/request-link', '/consume-link'])
  })

  it('leaves a collection the option does not name untouched', () => {
    const [, other] = fold(
      loginPlugin({ collections: [managers] }),
      collection('managers'),
      collection('media'),
    )

    expect(fieldNames(other)).not.toContain('magicLinkIssuedAt')
    expect(paths(other)).toEqual([])
  })

  it('wires every collection the option names', () => {
    const [a, b] = fold(
      loginPlugin({ collections: [managers, { slug: 'staff' as never }] }),
      collection('managers'),
      collection('staff'),
    )

    expect(paths(a)).toEqual(['/request-link', '/consume-link'])
    expect(paths(b)).toEqual(['/request-link', '/consume-link'])
  })

  it('ignores an option slug that names no collection', () => {
    // A plugin folds before `sanitizeConfig`, so a throw here takes the whole
    // config down at boot — on a typo in an option. Folded against a real
    // collection on purpose: an empty config never reaches the lookup, so the
    // same assertion over `fold(plugin)` alone would pass without testing it.
    const folded = fold(
      loginPlugin({ collections: [managers, { slug: 'nope' as never }] }),
      collection('managers'),
    )

    expect(folded).toHaveLength(1)
    expect(folded[0]!.slug).toBe('managers')
    expect(paths(folded[0]!)).toEqual(['/request-link', '/consume-link'])
  })

  it('wires nothing when no collection is named, or when disabled', () => {
    const bare = fold(loginPlugin(), collection('managers'))
    const empty = fold(loginPlugin({ collections: [] }), collection('managers'))
    const off = fold(
      loginPlugin({ collections: [managers], enabled: false }),
      collection('managers'),
    )

    for (const [wired] of [bare, empty, off].map((c) => c)) {
      expect(fieldNames(wired)).not.toContain('magicLinkIssuedAt')
      expect(paths(wired)).toEqual([])
    }
  })
})
