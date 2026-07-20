/**
 * Integration tests for translations globals after the #414 refactor.
 *
 * Verifies:
 * - The tabs field is the first (and only) top-level field in each global.
 * - The tabs structure preserves Title-Case labels per global.
 * - Each leaf group emits one JSON field; richText keys live as siblings.
 * - Nested tabs (wm-app-translations, sy-atlas-translations) are wrapped in a
 *   Payload group named after the tab slug so the API response is namespaced:
 *   `{ onboarding: { welcome: {…} } }` instead of `{ onboarding_welcome: {…} }`.
 * - wm-web has no group wrappers; sy-atlas mixes leaf tabs (Common, Share) with
 *   nested tabs (Region, Event, Registration) that do.
 * - richText fields inside nested tabs keep the sub-slug prefix (the group
 *   wrapper supplies the tab namespace), so the field name is
 *   `welcome_legal_disclaimer` and the API path is
 *   `onboarding.welcome_legal_disclaimer`.
 */
import type { Field, Payload, TabsField } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestEnvironment } from '../utils/testHelpers'

const TRANSLATION_GLOBAL_SLUGS = [
  'wm-web-translations',
  'wm-app-translations',
  'sy-atlas-translations',
] as const

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
      } else if (f.type === 'group') {
        if (predicate(f)) {
          out.push(f)
        } else {
          out.push(...collectFieldsByPredicate(f.fields, predicate))
        }
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
    it('wm-web-translations has Common, Navigation, Footer, Page Tags, Errors tabs', () => {
      const tabsField = findGlobal('wm-web-translations').fields[0] as TabsField
      const labels = tabsField.tabs.map((t) => t.label)
      expect(labels).toEqual(['Common', 'Navigation', 'Footer', 'Page Tags', 'Errors'])
    })

    it('sy-atlas-translations has Common, Region, Event, Registration, Share, Emails tabs', () => {
      const tabsField = findGlobal('sy-atlas-translations').fields[0] as TabsField
      const labels = tabsField.tabs.map((t) => t.label)
      expect(labels).toEqual(['Common', 'Region', 'Event', 'Registration', 'Share', 'Emails'])
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
      expect(names).toContain('footer')
      expect(names).toContain('page_tags')
      expect(names).toContain('errors')
    })

    it('sy-atlas-translations emits a JSON field named after each leaf slug', () => {
      const tabsField = findGlobal('sy-atlas-translations').fields[0] as TabsField
      const jsonFields = tabsField.tabs.flatMap((t) =>
        collectFieldsByPredicate(t.fields, (f) => f.type === 'json'),
      ) as Array<{ name: string }>
      const names = jsonFields.map((f) => f.name)
      // Leaf tabs emit a field named after the tab (`common`, `share`); nested
      // tabs emit one field per sub-group. Assert the full set so a dropped
      // sub-group (e.g. event.recurrence, registration.errors) is caught.
      expect(names).toEqual(
        expect.arrayContaining([
          'common',
          'locations',
          'venues',
          'details',
          'recurrence',
          'timing',
          'form',
          'errors',
          'questions',
          'share',
        ]),
      )
    })

    it('wm-app-translations uses namespaced sub-group field names (no tab prefix, no `strings` sub-field)', () => {
      const tabsField = findGlobal('wm-app-translations').fields[0] as TabsField
      const jsonFields = tabsField.tabs.flatMap((t) =>
        collectFieldsByPredicate(t.fields, (f) => f.type === 'json'),
      ) as Array<{ name: string }>
      const names = jsonFields.map((f) => f.name)
      expect(names).toContain('welcome')
      expect(names).toContain('name')
      expect(names).not.toContain('strings')
      expect(names).not.toContain('onboarding_welcome')
    })

    it('wm-app-translations names richText fields <subSlug>_<key> inside the onboarding group', () => {
      const tabsField = findGlobal('wm-app-translations').fields[0] as TabsField
      const richText = tabsField.tabs.flatMap((t) =>
        collectFieldsByPredicate(t.fields, (f) => f.type === 'richText'),
      ) as Array<{ name: string }>
      const names = richText.map((f) => f.name)
      // The group wrapper supplies the `onboarding` namespace, so the field name
      // keeps the sub-slug prefix but not the tab prefix.
      expect(names).toContain('welcome_legal_disclaimer')
      expect(names).not.toContain('legal_disclaimer')
      expect(names).not.toContain('onboarding_welcome_legal_disclaimer')
    })

    it('wm-web has no group wrappers', () => {
      const tabsField = findGlobal('wm-web-translations').fields[0] as TabsField
      const groups = tabsField.tabs.flatMap((t) =>
        collectFieldsByPredicate(t.fields, (f) => f.type === 'group'),
      )
      expect(groups).toHaveLength(0)
    })

    it('wm-app-translations wraps each nested-tab in a single group containing an inner tabs field', () => {
      const tabsField = findGlobal('wm-app-translations').fields[0] as TabsField
      for (const tab of tabsField.tabs) {
        const groups = tab.fields.filter((f) => f.type === 'group') as Array<{
          type: 'group'
          name: string
          fields: Field[]
        }>
        // Each tab has either 0 groups (simple leaf tab) or exactly 1 group (nested sub-groups)
        expect(groups.length === 0 || groups.length === 1).toBe(true)
        if (groups.length === 1) {
          expect(groups[0]!.fields[0]?.type).toBe('tabs')
        }
      }
    })

    it('sy-atlas-translations wraps nested tabs (Region, Event, Registration) in a single group with an inner tabs field', () => {
      const tabsField = findGlobal('sy-atlas-translations').fields[0] as TabsField
      const nestedTabs = new Set(['Region', 'Event', 'Registration'])
      for (const tab of tabsField.tabs) {
        const label = String(tab.label)
        const groups = tab.fields.filter((f) => f.type === 'group') as Array<{
          type: 'group'
          fields: Field[]
        }>
        if (nestedTabs.has(label)) {
          // Nested tabs wrap their subgroups in exactly one group whose first
          // field is the inner tabs field.
          expect(groups, label).toHaveLength(1)
          expect(groups[0]!.fields[0]?.type).toBe('tabs')
        } else {
          // Leaf tabs (Common, Share) have no group wrapper.
          expect(groups, label).toHaveLength(0)
        }
      }
    })
  })
})
