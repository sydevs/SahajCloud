/**
 * Integration tests for translations globals configuration
 *
 * Tests that the translation globals are correctly configured with tabs
 * using the buildTranslationTabs() utility.
 */
import type { Payload } from 'payload'

import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import { createTestEnvironment } from '../utils/testHelpers'

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

  describe('WeMeditate Web Translations', () => {
    it('should have tabs field as the root field', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-web-translations')
      expect(global).toBeDefined()
      expect(global?.fields[0].type).toBe('tabs')
    })

    it('should have 2 tabs: Common and Navigation', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-web-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        expect(tabsField.tabs).toHaveLength(2)
        expect(tabsField.tabs[0].label).toBe('Common')
        expect(tabsField.tabs[1].label).toBe('Navigation')
      }
    })

    it('should have JSON fields with correct names matching group slugs', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-web-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        const commonField = tabsField.tabs[0].fields[0]
        const navigationField = tabsField.tabs[1].fields[0]

        expect(commonField.name).toBe('common')
        expect(commonField.type).toBe('json')

        expect(navigationField.name).toBe('navigation')
        expect(navigationField.type).toBe('json')
      }
    })

    it('should have JSON fields configured for localization via TranslationsTable', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-web-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        for (const tab of tabsField.tabs) {
          const field = tab.fields[0]
          expect(field.admin?.components?.Field).toBe('@/components/admin/TranslationsTable')
        }
      }
    })

    it('should have unique jsonSchema URIs for each tab', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-web-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        const uris = tabsField.tabs.map((tab) => tab.fields[0].jsonSchema?.uri)

        expect(uris[0]).toBe('a://wm-web-translations/common.json')
        expect(uris[1]).toBe('a://wm-web-translations/navigation.json')
        expect(new Set(uris).size).toBe(uris.length)
      }
    })
  })

  describe('WeMeditate App Translations', () => {
    it('should have tabs field as the root field', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      expect(global).toBeDefined()
      expect(global?.fields[0].type).toBe('tabs')
    })

    it('should have 9 tabs: Onboarding, Daily, Path, Explore, Profile, Meditation, Auth, Navigation, General', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        expect(tabsField.tabs).toHaveLength(9)
        expect(tabsField.tabs[0].label).toBe('Onboarding')
        expect(tabsField.tabs[1].label).toBe('Daily')
        expect(tabsField.tabs[2].label).toBe('Path')
        expect(tabsField.tabs[3].label).toBe('Explore')
        expect(tabsField.tabs[4].label).toBe('Profile')
        expect(tabsField.tabs[5].label).toBe('Meditation')
        expect(tabsField.tabs[6].label).toBe('Auth')
        expect(tabsField.tabs[7].label).toBe('Navigation')
        expect(tabsField.tabs[8].label).toBe('General')
      }
    })

    it('should have nested tabs for grouped sections and JSON fields for leaf sections', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        // Tabs 0–6 (Onboarding through Auth) are grouped — each has a nested tabs field
        for (let i = 0; i <= 6; i++) {
          expect(tabsField.tabs[i].fields[0].type).toBe('tabs')
        }
        // Tabs 7–8 (Navigation, General) are leaf groups — each has a direct JSON field
        expect(tabsField.tabs[7].fields[0].name).toBe('navigation')
        expect(tabsField.tabs[7].fields[0].type).toBe('json')
        expect(tabsField.tabs[8].fields[0].name).toBe('general')
        expect(tabsField.tabs[8].fields[0].type).toBe('json')
      }
    })

    it('should have globalSlug passed to each field', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        for (const tab of tabsField.tabs) {
          const firstField = tab.fields[0]
          if (firstField.type === 'tabs') {
            // Parent group — check globalSlug on each inner sub-tab's JSON field
            for (const innerTab of (firstField as { type: 'tabs'; tabs: typeof tabsField.tabs }).tabs) {
              const jsonField = innerTab.fields.find((f) => f.type === 'json')
              expect(jsonField?.admin?.custom?.globalSlug).toBe('wm-app-translations')
            }
          } else {
            // Leaf group — check globalSlug on the direct JSON field
            const jsonField = tab.fields.find((f) => f.type === 'json')
            expect(jsonField?.admin?.custom?.globalSlug).toBe('wm-app-translations')
          }
        }
      }
    })

    it('should have schemaEntries with keys for each group', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        // Check daily.main sub-tab has expected keys (daily is tab index 1)
        const dailyInnerTabs = (
          tabsField.tabs[1].fields[0] as { type: 'tabs'; tabs: typeof tabsField.tabs }
        ).tabs
        const dailyMainJsonField = dailyInnerTabs[0].fields.find((f) => f.type === 'json')
        const dailyMainEntries = dailyMainJsonField?.admin?.custom?.schemaEntries as Array<{
          key: string
          description: string
        }>
        const dailyMainKeys = dailyMainEntries.map((e) => e.key)
        expect(dailyMainKeys).toContain('start_meditation')
        expect(dailyMainKeys).toContain('start_now')

        // Check explore.talks_player sub-tab has expected keys (explore is tab index 3)
        const exploreInnerTabs = (
          tabsField.tabs[3].fields[0] as { type: 'tabs'; tabs: typeof tabsField.tabs }
        ).tabs
        const talksPlayerTab = exploreInnerTabs.find((t) => t.label === 'Talks Player')
        const talksPlayerJsonField = talksPlayerTab?.fields.find((f) => f.type === 'json')
        const talksPlayerEntries = talksPlayerJsonField?.admin?.custom?.schemaEntries as Array<{
          key: string
          description: string
        }>
        const talksPlayerKeys = talksPlayerEntries.map((e) => e.key)
        expect(talksPlayerKeys).toContain('play')
        expect(talksPlayerKeys).toContain('pause')
      }
    })
  })

  describe('Sahaj Atlas Translations', () => {
    it('should have tabs field as the root field', () => {
      const global = payload.globals.config.find((g) => g.slug === 'sy-atlas-translations')
      expect(global).toBeDefined()
      expect(global?.fields[0].type).toBe('tabs')
    })

    it('should have 3 tabs: Common, Map, Location', () => {
      const global = payload.globals.config.find((g) => g.slug === 'sy-atlas-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        expect(tabsField.tabs).toHaveLength(3)
        expect(tabsField.tabs[0].label).toBe('Common')
        expect(tabsField.tabs[1].label).toBe('Map')
        expect(tabsField.tabs[2].label).toBe('Location')
      }
    })

    it('should have JSON fields with correct names matching group slugs', () => {
      const global = payload.globals.config.find((g) => g.slug === 'sy-atlas-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        const fieldNames = tabsField.tabs.map((tab) => tab.fields[0].name)

        expect(fieldNames).toEqual(['common', 'map', 'location'])
      }
    })

    it('should have snake_case keys in map group (converted from camelCase)', () => {
      const global = payload.globals.config.find((g) => g.slug === 'sy-atlas-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        const mapEntries = tabsField.tabs[1].fields[0].admin?.custom?.schemaEntries as Array<{
          key: string
          description: string
        }>
        const mapKeys = mapEntries.map((e) => e.key)

        expect(mapKeys).toContain('zoom_in')
        expect(mapKeys).toContain('zoom_out')
        expect(mapKeys).toContain('my_location')
        // Should NOT contain camelCase versions
        expect(mapKeys).not.toContain('zoomIn')
        expect(mapKeys).not.toContain('zoomOut')
        expect(mapKeys).not.toContain('myLocation')
      }
    })
  })

  describe('All translations globals', () => {
    const translationGlobalSlugs = ['wm-web-translations', 'wm-app-translations', 'sy-atlas-translations']

    it.each(translationGlobalSlugs)('should have version control enabled for %s', (slug) => {
      const global = payload.globals.config.find((g) => g.slug === slug)
      expect(global?.versions).toBeDefined()
      expect(global?.versions?.max).toBe(3)
    })

    it.each(translationGlobalSlugs)('should have consistent jsonSchema configuration for %s', (slug) => {
      const global = payload.globals.config.find((g) => g.slug === slug)
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        for (const tab of tabsField.tabs) {
          const firstField = tab.fields[0]
          const jsonFields =
            firstField.type === 'tabs'
              ? // Parent group — collect JSON fields from all inner sub-tabs
                (firstField as { type: 'tabs'; tabs: typeof tabsField.tabs }).tabs.flatMap((innerTab) =>
                  innerTab.fields.filter((f) => f.type === 'json'),
                )
              : // Leaf group — find the JSON field directly
                tab.fields.filter((f) => f.type === 'json')

          for (const jsonField of jsonFields) {
            expect(jsonField.jsonSchema).toBeDefined()
            expect(jsonField.jsonSchema?.uri).toMatch(/^a:\/\//)
            expect(jsonField.jsonSchema?.schema).toBeDefined()
            expect(jsonField.jsonSchema?.schema?.type).toBe('object')
          }
        }
      }
    })
  })
})
