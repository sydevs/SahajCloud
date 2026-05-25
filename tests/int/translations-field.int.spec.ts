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

  describe('JSON field shape (no jsonSchema — Ajv breaks on Cloudflare Workers)', () => {
    // The factory used to set a `jsonSchema` config that Payload compiled via
    // Ajv on every write. Ajv uses `new Function()` for performance, which
    // Cloudflare Workers' V8 isolate blocks with "Code generation from strings
    // disallowed for this context". Validation is now enforced by a pure-JS
    // `validate` function — keys/types/additionalProperties checked the same
    // way, just without Ajv compilation. The admin UI is unaffected (custom
    // TranslationsTable component, no Monaco involvement on these fields).

    it('does not set jsonSchema on the emitted JSON field', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: { type: 'object', description: 'Common', properties: {} },
          navigation: { type: 'object', description: 'Nav', properties: {} },
        },
      }
      const tabs = buildTranslationTabs(schema, 'wm-web-translations')
      for (const tab of tabs) {
        expect(tab.fields[0].jsonSchema).toBeUndefined()
      }
    })

    it('exposes a validate function on every JSON field', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          map: {
            type: 'object',
            description: 'Map',
            properties: { center: { type: 'string', description: 'Center' } },
          },
        },
      }
      const tabs = buildTranslationTabs(schema, 'sy-atlas-translations')
      const field = tabs[0].fields[0] as { validate?: (v: unknown) => unknown }
      expect(typeof field.validate).toBe('function')
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

  describe('pure-JS validate function (replaces Ajv-compiled jsonSchema)', () => {
    function getValidate(schema: TranslationsSchema, leaf: string, globalSlug = 'test') {
      const tabs = buildTranslationTabs(schema, globalSlug)
      const tab = tabs.find((t) => t.label?.toLowerCase().replace(/\s+/g, '_') === leaf)
      const field = tab?.fields[0] as { validate?: (v: unknown) => true | string } | undefined
      if (!field?.validate) throw new Error(`No validate function on tab "${leaf}"`)
      return field.validate
    }

    it('accepts undefined / null (empty values pass)', () => {
      const validate = getValidate(
        {
          type: 'object',
          properties: {
            common: {
              type: 'object',
              description: '',
              properties: { loading: { type: 'string', description: '' } },
            },
          },
        },
        'common',
      )
      expect(validate(undefined)).toBe(true)
      expect(validate(null)).toBe(true)
    })

    it('rejects non-object values', () => {
      const validate = getValidate(
        {
          type: 'object',
          properties: {
            common: {
              type: 'object',
              description: '',
              properties: { loading: { type: 'string', description: '' } },
            },
          },
        },
        'common',
      )
      expect(validate('hello')).toMatch(/must be a JSON object/)
      expect(validate(42)).toMatch(/must be a JSON object/)
      expect(validate([])).toMatch(/must be a JSON object/)
    })

    it('rejects missing required keys', () => {
      const validate = getValidate(
        {
          type: 'object',
          properties: {
            common: {
              type: 'object',
              description: '',
              properties: {
                loading: { type: 'string', description: '' },
                error: { type: 'string', description: '' },
              },
            },
          },
        },
        'common',
      )
      expect(validate({ loading: 'Loading' })).toMatch(/Missing required key "error"/)
    })

    it('rejects unknown keys when additionalProperties is not true', () => {
      const validate = getValidate(
        {
          type: 'object',
          properties: {
            common: {
              type: 'object',
              description: '',
              properties: { loading: { type: 'string', description: '' } },
              additionalProperties: false,
            },
          },
        },
        'common',
      )
      expect(validate({ loading: 'Loading', mystery: 'extra' })).toMatch(
        /Unknown key "mystery"/,
      )
    })

    it('accepts unknown keys when additionalProperties is true', () => {
      const validate = getValidate(
        {
          type: 'object',
          properties: {
            flexible: {
              type: 'object',
              description: '',
              properties: { known: { type: 'string', description: '' } },
              additionalProperties: true,
            },
          },
        },
        'flexible',
      )
      expect(validate({ known: 'value', extra: 'also fine' })).toBe(true)
    })

    it('rejects non-string values for declared keys', () => {
      const validate = getValidate(
        {
          type: 'object',
          properties: {
            common: {
              type: 'object',
              description: '',
              properties: { loading: { type: 'string', description: '' } },
            },
          },
        },
        'common',
      )
      expect(validate({ loading: 42 })).toMatch(/must be a string/)
      expect(validate({ loading: null })).toMatch(/must be a string/)
    })

    it('accepts a well-formed object with all required keys present', () => {
      const validate = getValidate(
        {
          type: 'object',
          properties: {
            common: {
              type: 'object',
              description: '',
              properties: {
                loading: { type: 'string', description: '' },
                error: { type: 'string', description: '' },
              },
            },
          },
        },
        'common',
      )
      expect(validate({ loading: 'Loading', error: 'Oops' })).toBe(true)
    })
  })
})
