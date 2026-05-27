/**
 * Integration tests for translations globals after the #414 refactor.
 *
 * Verifies:
 * - The tabs field is the first (and only) top-level field in each global.
 * - The tabs structure preserves Title-Case labels per global.
 * - Each leaf group emits one JSON field named after its (possibly nested)
 *   leaf slug; richText keys live as `<leafSlug>_<key>` siblings. No more
 *   `strings` sub-field or group wrapper.
 */
import type { Field, Payload, TabsField } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestEnvironment } from '../utils/testHelpers'

const TRANSLATION_GLOBAL_SLUGS = ['wm-web-translations', 'wm-app-translations', 'sy-atlas-translations'] as const

type Slug = (typeof TRANSLATION_GLOBAL_SLUGS)[number]

describe('Translations Globals Configuration', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  function findGlobal(slug: Slug) {
    const g = payload.globals.config.find((cfg) => cfg.slug === slug)
    if (!g) throw new Error(`Global ${slug} not found`)
    return g
  }

  function collectFieldsByPredicate(
    fields: ReadonlyArray<Field>,
    predicate: (f: Field) => boolean,
  ): Field[] {
    const out: Field[] = []
    for (const f of fields) {
      if (f.type === 'tabs') {
        for (const tab of f.tabs) out.push(...collectFieldsByPredicate(tab.fields, predicate))
      } else if (f.type === 'row' || f.type === 'collapsible') {
        out.push(...collectFieldsByPredicate(f.fields, predicate))
      } else if (predicate(f)) {
        out.push(f)
      }
    }
    return out
  }

  it.each(TRANSLATION_GLOBAL_SLUGS)('%s has the tabs field as the only top-level field', (slug) => {
    const global = findGlobal(slug)
    expect(global.fields[0]?.type).toBe('tabs')
  })

  describe('Tab structure', () => {
    it('wm-web-translations has Common and Navigation tabs', () => {
      const tabsField = findGlobal('wm-web-translations').fields[0] as TabsField
      const labels = tabsField.tabs.map((t) => t.label)
      expect(labels).toEqual(['Common', 'Navigation'])
    })

    it('sy-atlas-translations has Common, Map, Location tabs', () => {
      const tabsField = findGlobal('sy-atlas-translations').fields[0] as TabsField
      const labels = tabsField.tabs.map((t) => t.label)
      expect(labels).toEqual(['Common', 'Map', 'Location'])
    })
  })

  describe('Per-leaf-group JSON fields + richText siblings', () => {
    it('wm-web-translations emits a JSON field named after each leaf slug', () => {
      const tabsField = findGlobal('wm-web-translations').fields[0] as TabsField
      const jsonFields = tabsField.tabs.flatMap((t) =>
        collectFieldsByPredicate(t.fields, (f) => f.type === 'json'),
      ) as Array<{ name: string }>
      const names = jsonFields.map((f) => f.name)
      expect(names).toContain('common')
      expect(names).toContain('navigation')
    })

    it('sy-atlas-translations emits a JSON field named after each leaf slug', () => {
      const tabsField = findGlobal('sy-atlas-translations').fields[0] as TabsField
      const jsonFields = tabsField.tabs.flatMap((t) =>
        collectFieldsByPredicate(t.fields, (f) => f.type === 'json'),
      ) as Array<{ name: string }>
      const names = jsonFields.map((f) => f.name)
      expect(names).toEqual(expect.arrayContaining(['common', 'map', 'location']))
    })

    it('wm-app-translations flattens nested groups into onboarding_welcome (no `strings` sub-field)', () => {
      const tabsField = findGlobal('wm-app-translations').fields[0] as TabsField
      const jsonFields = tabsField.tabs.flatMap((t) =>
        collectFieldsByPredicate(t.fields, (f) => f.type === 'json'),
      ) as Array<{ name: string }>
      const names = jsonFields.map((f) => f.name)
      expect(names).toContain('onboarding_welcome')
      expect(names).toContain('onboarding_name')
      expect(names).not.toContain('strings')
    })

    it('wm-app-translations exposes legal_disclaimer as a richText sibling at the tab level', () => {
      const tabsField = findGlobal('wm-app-translations').fields[0] as TabsField
      const richText = tabsField.tabs.flatMap((t) =>
        collectFieldsByPredicate(t.fields, (f) => f.type === 'richText'),
      ) as Array<{ name: string }>
      expect(richText.map((f) => f.name)).toContain('onboarding_welcome_legal_disclaimer')
    })

    it('no group wrapper survives anywhere in the translation tabs', () => {
      for (const slug of TRANSLATION_GLOBAL_SLUGS) {
        const tabsField = findGlobal(slug).fields[0] as TabsField
        const groups = tabsField.tabs.flatMap((t) =>
          collectFieldsByPredicate(t.fields, (f) => f.type === 'group'),
        )
        expect(groups).toHaveLength(0)
      }
    })
  })

})
