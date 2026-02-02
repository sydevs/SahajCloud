/**
 * Integration tests for translations field utilities
 *
 * Tests the buildTranslationTabs() function that converts nested JSON schemas
 * into PayloadCMS tabs configuration for translation globals.
 */
import { describe, it, expect } from 'vitest'

import { buildTranslationTabs, type TranslationsSchema, type SchemaEntry } from '@/fields'

describe('buildTranslationTabs', () => {
  describe('tab generation', () => {
    it('generates tabs from nested schema structure', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            description: 'Common strings',
            properties: {
              loading: { type: 'string', description: 'Loading text' },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      }

      const tabs = buildTranslationTabs(schema, 'test-translations')

      expect(tabs).toHaveLength(1)
      expect(tabs[0].label).toBe('Common')
      expect(tabs[0].description).toBe('Common strings')
      expect(tabs[0].fields).toHaveLength(1)
    })

    it('generates multiple tabs for multiple groups', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            description: 'Common strings',
            properties: {
              loading: { type: 'string', description: 'Loading' },
            },
          },
          navigation: {
            type: 'object',
            description: 'Navigation labels',
            properties: {
              about: { type: 'string', description: 'About link' },
            },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test-translations')

      expect(tabs).toHaveLength(2)
      expect(tabs[0].label).toBe('Common')
      expect(tabs[1].label).toBe('Navigation')
    })

    it('handles empty schema gracefully', () => {
      const schema: TranslationsSchema = {
        type: 'object',
      }

      const tabs = buildTranslationTabs(schema, 'test-translations')

      expect(tabs).toHaveLength(0)
    })

    it('handles schema with empty properties object', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {},
      }

      const tabs = buildTranslationTabs(schema, 'test-translations')

      expect(tabs).toHaveLength(0)
    })
  })

  describe('title case conversion', () => {
    it('converts single word group names to Title Case', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: { type: 'object', description: 'Common', properties: {} },
          daily: { type: 'object', description: 'Daily', properties: {} },
          meditation: { type: 'object', description: 'Meditation', properties: {} },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')

      expect(tabs[0].label).toBe('Common')
      expect(tabs[1].label).toBe('Daily')
      expect(tabs[2].label).toBe('Meditation')
    })

    it('converts underscore-separated names to Title Case', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          user_settings: { type: 'object', description: 'Settings', properties: {} },
          navigation_menu: { type: 'object', description: 'Menu', properties: {} },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')

      expect(tabs[0].label).toBe('User Settings')
      expect(tabs[1].label).toBe('Navigation Menu')
    })

    it('converts hyphen-separated names to Title Case', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          'user-profile': { type: 'object', description: 'Profile', properties: {} },
          'home-screen': { type: 'object', description: 'Home', properties: {} },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')

      expect(tabs[0].label).toBe('User Profile')
      expect(tabs[1].label).toBe('Home Screen')
    })
  })

  describe('JSON field configuration', () => {
    it('creates JSON field with correct name matching group slug', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            description: 'Common',
            properties: {
              loading: { type: 'string', description: 'Loading' },
            },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const field = tabs[0].fields[0]

      expect(field.name).toBe('common')
      expect(field.type).toBe('json')
    })

    it('sets localized to true on JSON fields', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: { type: 'object', description: 'Common', properties: {} },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const field = tabs[0].fields[0]

      expect(field.localized).toBe(true)
    })

    it('configures TranslationsTable component', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: { type: 'object', description: 'Common', properties: {} },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const field = tabs[0].fields[0]

      expect(field.admin?.components?.Field).toBe('@/components/admin/TranslationsTable')
    })
  })

  describe('unique URIs', () => {
    it('generates unique URIs for each tab', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: { type: 'object', description: 'Common', properties: {} },
          navigation: { type: 'object', description: 'Nav', properties: {} },
        },
      }

      const tabs = buildTranslationTabs(schema, 'wm-web-translations')
      const uris = tabs.map((tab) => tab.fields[0].jsonSchema?.uri)

      expect(uris).toHaveLength(2)
      expect(uris[0]).toBe('a://wm-web-translations/common.json')
      expect(uris[1]).toBe('a://wm-web-translations/navigation.json')
      // Verify all unique
      expect(new Set(uris).size).toBe(2)
    })

    it('includes globalSlug in URI path', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          map: { type: 'object', description: 'Map', properties: {} },
        },
      }

      const tabs = buildTranslationTabs(schema, 'sy-atlas-translations')
      const field = tabs[0].fields[0]

      expect(field.jsonSchema?.uri).toBe('a://sy-atlas-translations/map.json')
      expect(field.jsonSchema?.fileMatch).toContain('a://sy-atlas-translations/map.json')
    })
  })

  describe('schemaEntries extraction', () => {
    it('extracts schemaEntries correctly for TranslationsTable', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            description: 'Common strings',
            properties: {
              loading: { type: 'string', description: 'Loading text' },
              error: { type: 'string', description: 'Error message' },
            },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const schemaEntries = tabs[0].fields[0].admin?.custom?.schemaEntries as SchemaEntry[]

      expect(schemaEntries).toHaveLength(2)
      expect(schemaEntries[0]).toEqual({ key: 'loading', description: 'Loading text' })
      expect(schemaEntries[1]).toEqual({ key: 'error', description: 'Error message' })
    })

    it('handles empty properties in group', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          empty: {
            type: 'object',
            description: 'Empty group',
            properties: {},
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const schemaEntries = tabs[0].fields[0].admin?.custom?.schemaEntries as SchemaEntry[]

      expect(schemaEntries).toHaveLength(0)
    })

    it('handles missing description in properties', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            description: 'Common',
            properties: {
              loading: { type: 'string' }, // No description
            },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const schemaEntries = tabs[0].fields[0].admin?.custom?.schemaEntries as SchemaEntry[]

      expect(schemaEntries[0]).toEqual({ key: 'loading', description: '' })
    })
  })

  describe('globalSlug passing', () => {
    it('passes globalSlug to TranslationsTable component', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            description: 'Common',
            properties: {
              test: { type: 'string', description: 'Test' },
            },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'wm-app-translations')
      const globalSlug = tabs[0].fields[0].admin?.custom?.globalSlug

      expect(globalSlug).toBe('wm-app-translations')
    })
  })

  describe('jsonSchema configuration', () => {
    it('creates valid jsonSchema for each group', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            description: 'Common',
            properties: {
              loading: { type: 'string', description: 'Loading' },
            },
            additionalProperties: false,
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const jsonSchema = tabs[0].fields[0].jsonSchema

      expect(jsonSchema).toBeDefined()
      expect(jsonSchema?.schema).toBeDefined()
      expect(jsonSchema?.schema?.type).toBe('object')
      expect(jsonSchema?.schema?.additionalProperties).toBe(false)
    })

    it('preserves additionalProperties setting from group schema', () => {
      const schemaAllowAdditional: TranslationsSchema = {
        type: 'object',
        properties: {
          flexible: {
            type: 'object',
            description: 'Flexible group',
            properties: {},
            additionalProperties: true,
          },
        },
      }

      const schemaNoAdditional: TranslationsSchema = {
        type: 'object',
        properties: {
          strict: {
            type: 'object',
            description: 'Strict group',
            properties: {},
            additionalProperties: false,
          },
        },
      }

      const tabsFlexible = buildTranslationTabs(schemaAllowAdditional, 'test')
      const tabsStrict = buildTranslationTabs(schemaNoAdditional, 'test')

      expect(tabsFlexible[0].fields[0].jsonSchema?.schema?.additionalProperties).toBe(true)
      expect(tabsStrict[0].fields[0].jsonSchema?.schema?.additionalProperties).toBe(false)
    })

    it('defaults additionalProperties to false when not specified', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          noSpec: {
            type: 'object',
            description: 'No additionalProperties specified',
            properties: {},
            // No additionalProperties specified
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')

      expect(tabs[0].fields[0].jsonSchema?.schema?.additionalProperties).toBe(false)
    })
  })
})
