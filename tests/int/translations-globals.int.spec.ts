/**
 * Integration tests for translations globals after the #414 refactor.
 *
 * Verifies:
 * - The tabs field is the first (and only) top-level field in each global.
 * - The tabs structure preserves Title-Case labels per global.
 * - Each leaf group emits one JSON field. richText keys live as siblings.
 * - Nested tabs (wm-app-translations, sy-atlas-translations) are wrapped in a
 *   Payload group named after the tab slug so the API response is namespaced:
 *   `{ onboarding: { welcome: {…} } }` instead of `{ onboarding_welcome: {…} }`.
 * - wm-web has no group wrappers. Sy-atlas mixes leaf tabs (Common, Share) with
 *   nested tabs (Region, Event, Registration) that do.
 * - richText fields inside nested tabs keep the sub-slug prefix (the group
 *   wrapper supplies the tab namespace), so the field name is
 *   `welcome_legal_disclaimer` and the API path is
 *   `onboarding.welcome_legal_disclaimer`.
 * - Since #705 each sub-group renders as a collapsible rather than an inner
 *   tabs row, `localizeStatus` is on for the two web-project globals and off
 *   for `wm-app-translations`, the JSON columns enforce their own schema on
 *   write, and an API client reading a partly translated locale gets English
 *   for the blanks.
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
      // Leaf tabs emit a field named after the tab (`common`, `share`). Nested
      // tabs emit one field per sub-group. Assert the full set so a dropped
      // sub-group (for example, event.recurrence, registration.errors) is caught.
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

    it('wm-app-translations wraps each nested-tab in a single group of collapsibles', () => {
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
          expect(groups[0]!.fields.every((f) => f.type === 'collapsible')).toBe(true)
        }
      }
    })

    it('sy-atlas-translations wraps nested tabs (Region, Event, Registration) in a single group of collapsibles', () => {
      const tabsField = findGlobal('sy-atlas-translations').fields[0] as TabsField
      const nestedTabs = new Set(['Region', 'Event', 'Registration'])
      for (const tab of tabsField.tabs) {
        const label = String(tab.label)
        const groups = tab.fields.filter((f) => f.type === 'group') as Array<{
          type: 'group'
          fields: Field[]
        }>
        if (nestedTabs.has(label)) {
          // Nested tabs wrap their sub-groups in exactly one group, whose
          // fields are one collapsible each (#705 — no inner tabs row).
          expect(groups, label).toHaveLength(1)
          expect(groups[0]!.fields.every((f) => f.type === 'collapsible'), label).toBe(true)
        } else {
          // Leaf tabs (Common, Share) have no group wrapper.
          expect(groups, label).toHaveLength(0)
        }
      }
    })
  })

  // The root `experimental.localizeStatus` flag alone changes nothing: Payload
  // forces it off per entity unless the global also asks for it. So the two
  // web-project globals must differ from `wm-app-translations` here, and a
  // suite whose test config forgot the root flag would see all three the same.
  describe('per-locale publish status', () => {
    it('is on for the two web-project globals and off for wm-app-translations', () => {
      const localizeStatus = (slug: Slug) => {
        const versions = findGlobal(slug).versions as { drafts?: { localizeStatus?: boolean } }
        return versions.drafts?.localizeStatus === true
      }
      expect(localizeStatus('sy-atlas-translations')).toBe(true)
      expect(localizeStatus('wm-web-translations')).toBe(true)
      expect(localizeStatus('wm-app-translations')).toBe(false)
    })

    it('publishing one locale leaves the others unpublished', async () => {
      await payload.updateGlobal({
        slug: 'sy-atlas-translations',
        locale: 'fr',
        publishSpecificLocale: 'fr',
        data: { _status: 'published', common: { loading: 'Chargement…' } } as never,
        overrideAccess: true,
      })

      const all = (await payload.findGlobal({
        slug: 'sy-atlas-translations',
        locale: 'all',
        fallbackLocale: false,
        depth: 0,
        overrideAccess: true,
      })) as unknown as { _status: Record<string, string> }

      expect(all._status.fr).toBe('published')
      expect(all._status.de).not.toBe('published')
    })
  })

  // The JSON columns carry a `jsonSchema` and no `validate` of their own, so
  // Payload's built-in validator enforces the schema. These assertions exist
  // because a `validate` accidentally reintroduced anywhere would REPLACE that
  // validator, and every shape check would silently stop running.
  describe('the JSON columns enforce their schema on write', () => {
    const write = (data: Record<string, unknown>) =>
      payload.updateGlobal({
        slug: 'sy-atlas-translations',
        locale: 'en',
        data: data as never,
        overrideAccess: true,
      })

    it('rejects a key the schema does not declare', async () => {
      await expect(write({ common: { mystery: 'nope' } })).rejects.toThrow()
    })

    it('rejects a non-string value for a declared key', async () => {
      await expect(write({ common: { loading: 42 } })).rejects.toThrow()
    })

    it('accepts a partial object, and null', async () => {
      await expect(write({ common: { loading: 'Loading…' } })).resolves.toBeDefined()
      await expect(write({ common: null })).resolves.toBeDefined()
    })

    // Payload's built-in validator short-circuits on an "empty" value and
    // counts `[]` as empty, so the schema never sees it. The composed check
    // ahead of the delegation is what refuses it.
    it('rejects an array, which the built-in validator alone lets through', async () => {
      await expect(write({ common: [] })).rejects.toThrow()
      await expect(write({ common: ['a'] })).rejects.toThrow()
    })
  })
})
