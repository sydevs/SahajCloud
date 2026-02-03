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

    it('should have 5 tabs: Daily, Path, Explore, Profile, Meditation', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        expect(tabsField.tabs).toHaveLength(5)
        expect(tabsField.tabs[0].label).toBe('Daily')
        expect(tabsField.tabs[1].label).toBe('Path')
        expect(tabsField.tabs[2].label).toBe('Explore')
        expect(tabsField.tabs[3].label).toBe('Profile')
        expect(tabsField.tabs[4].label).toBe('Meditation')
      }
    })

    it('should have JSON fields with correct names matching group slugs', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        const fieldNames = tabsField.tabs.map((tab) => tab.fields[0].name)

        expect(fieldNames).toEqual(['daily', 'path', 'explore', 'profile', 'meditation'])
      }
    })

    it('should have globalSlug passed to each field', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        for (const tab of tabsField.tabs) {
          const field = tab.fields[0]
          expect(field.admin?.custom?.globalSlug).toBe('wm-app-translations')
        }
      }
    })

    it('should have schemaEntries with keys for each group', () => {
      const global = payload.globals.config.find((g) => g.slug === 'wm-app-translations')
      const tabsField = global?.fields[0]

      if (tabsField?.type === 'tabs') {
        // Check daily group has expected keys
        const dailyEntries = tabsField.tabs[0].fields[0].admin?.custom?.schemaEntries as Array<{
          key: string
          description: string
        }>
        const dailyKeys = dailyEntries.map((e) => e.key)
        expect(dailyKeys).toContain('title')
        expect(dailyKeys).toContain('subtitle')
        expect(dailyKeys).toContain('complete')
        expect(dailyKeys).toContain('streak')
        expect(dailyKeys).toContain('skip')

        // Check meditation group has expected keys
        const meditationEntries = tabsField.tabs[4].fields[0].admin?.custom?.schemaEntries as Array<{
          key: string
          description: string
        }>
        const meditationKeys = meditationEntries.map((e) => e.key)
        expect(meditationKeys).toContain('play')
        expect(meditationKeys).toContain('pause')
        expect(meditationKeys).toContain('complete')
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
          const field = tab.fields[0]
          expect(field.jsonSchema).toBeDefined()
          expect(field.jsonSchema?.uri).toMatch(/^a:\/\//)
          expect(field.jsonSchema?.schema).toBeDefined()
          expect(field.jsonSchema?.schema?.type).toBe('object')
        }
      }
    })
  })
})
