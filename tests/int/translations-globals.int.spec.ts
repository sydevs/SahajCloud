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

    it('should have 10 tabs: 7 nested + 2 flat + Review', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        expect(tabsField.tabs).toHaveLength(10)
        expect(tabsField.tabs[0].label).toBe('Onboarding')
        expect(tabsField.tabs[1].label).toBe('Daily')
        expect(tabsField.tabs[2].label).toBe('Path')
        expect(tabsField.tabs[3].label).toBe('Explore')
        expect(tabsField.tabs[4].label).toBe('Profile')
        expect(tabsField.tabs[5].label).toBe('Meditation')
        expect(tabsField.tabs[6].label).toBe('Auth')
        expect(tabsField.tabs[7].label).toBe('Navigation')
        expect(tabsField.tabs[8].label).toBe('General')
        expect(tabsField.tabs[9].label).toBe('Review')
      }
    })

    it('should have a group field as the first field in each nested translation tab', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        const nestedTabs = tabsField.tabs.slice(0, 7)
        const slugs = ['onboarding', 'daily', 'path', 'explore', 'profile', 'meditation', 'auth']

        nestedTabs.forEach((tab, i) => {
          const groupField = tab.fields[0]
          expect(groupField.type).toBe('group')
          expect((groupField as { name?: string }).name).toBe(slugs[i])
          expect((groupField as { label?: unknown }).label).toBe(false)
        })
      }
    })

    it('should have JSON sub-fields inside the group with names matching sub-group slugs', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        // Daily tab: sub-groups are main, common, load_info
        const dailyGroup = tabsField.tabs[1].fields[0]
        if (dailyGroup.type === 'group') {
          const jsonFields = dailyGroup.fields.filter((f) => f.type === 'json')
          const subSlugs = jsonFields.map((f) => (f as { name?: string }).name)
          expect(subSlugs).toContain('main')
          expect(subSlugs).toContain('common')
          expect(subSlugs).toContain('load_info')
        }
      }
    })

    it('should have unique JSON Schema URIs using parentSlug_subSlug format', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        const dailyGroup = tabsField.tabs[1].fields[0]
        if (dailyGroup.type === 'group') {
          const mainField = dailyGroup.fields.find(
            (f) => f.type === 'json' && (f as { name?: string }).name === 'main',
          )
          expect(
            (mainField as { jsonSchema?: { uri?: string } })?.jsonSchema?.uri,
          ).toBe('a://wm-app-translations/daily_main.json')
        }
      }
    })

    it('should have globalSlug passed to each JSON field inside the groups', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        const dailyGroup = tabsField.tabs[1].fields[0]
        if (dailyGroup.type === 'group') {
          const jsonFields = dailyGroup.fields.filter((f) => f.type === 'json')
          for (const field of jsonFields) {
            expect(
              (field as { admin?: { custom?: { globalSlug?: string } } }).admin?.custom?.globalSlug,
            ).toBe('wm-app-translations')
          }
        }
      }
    })

    it('should have flat tabs (Navigation, General) with a direct JSON field', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        const navigationTab = tabsField.tabs[7]
        const generalTab = tabsField.tabs[8]

        expect(navigationTab.fields[0].type).toBe('json')
        expect((navigationTab.fields[0] as { name?: string }).name).toBe('navigation')

        expect(generalTab.fields[0].type).toBe('json')
        expect((generalTab.fields[0] as { name?: string }).name).toBe('general')
      }
    })

    it('should have a Review tab with markReviewed and lastReviewedAt fields', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        const reviewTab = tabsField.tabs[9]
        expect(reviewTab.label).toBe('Review')

        const fieldNames = reviewTab.fields.map((f) => ('name' in f ? f.name : undefined))
        expect(fieldNames).toEqual(['markReviewed', 'lastReviewedAt'])
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
          // Skip non-translation tabs (e.g., the Review tab on wm-app-translations
          // which uses non-JSON fields for manual-review tracking).
          if (tab.label === 'Review') continue
          const firstField = tab.fields[0]
          // Nested tabs use a group field wrapping JSON sub-fields; flat tabs use a direct JSON field.
          const jsonFields =
            firstField.type === 'group'
              ? firstField.fields.filter((f) => f.type === 'json')
              : [firstField]
          for (const field of jsonFields) {
            expect(field.jsonSchema).toBeDefined()
            expect(field.jsonSchema?.uri).toMatch(/^a:\/\//)
            expect(field.jsonSchema?.schema).toBeDefined()
            expect(field.jsonSchema?.schema?.type).toBe('object')
          }
        }
      }
    })
  })
})
