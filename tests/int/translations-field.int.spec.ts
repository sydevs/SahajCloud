/**
 * Tests for buildTranslationTabs() — the factory that converts a nested JSON
 * schema into PayloadCMS tabs. After issue #414 each leaf group emits one
 * localized JSON field (for its string keys, rendered as rows by
 * TranslationsRow) plus one richText field per richText key. The legacy
 * `group` wrapper and `strings` sub-field are gone.
 *
 * Why JSON-per-leaf instead of a column-per-key: SQLite's `json_array()`
 * argument limit (~100) breaks `findGlobal` once a single global has too
 * many flat localized columns. wm-app-translations has ~478 leaf keys, which
 * a column-per-key design blows past.
 */
import { describe, expect, it } from 'vitest'

import { buildTranslationTabs, type SchemaEntry, type TranslationsSchema } from '@/fields'

describe('buildTranslationTabs', () => {
  describe('tab generation', () => {
    it('emits one tab per top-level group with Title-Case labels', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            description: 'Common strings',
            properties: { loading: { type: 'string', description: 'Loading text' } },
          },
          user_settings: {
            type: 'object',
            description: 'Settings',
            properties: { language: { type: 'string', description: 'Language' } },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test-translations')

      expect(tabs).toHaveLength(2)
      expect(tabs[0].label).toBe('Common')
      expect(tabs[0].description).toBe('Common strings')
      expect(tabs[1].label).toBe('User Settings')
    })

    it('returns no tabs for empty schemas', () => {
      expect(buildTranslationTabs({ type: 'object' }, 'x')).toHaveLength(0)
      expect(buildTranslationTabs({ type: 'object', properties: {} }, 'x')).toHaveLength(0)
    })
  })

  describe('per-leaf-group JSON field', () => {
    it('names the JSON field after the leaf slug — no `strings` sub-field', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          welcome: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Title' },
              subtitle: { type: 'string', description: 'Subtitle' },
            },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const fields = tabs[0].fields as Array<{ name: string; type: string }>
      expect(fields).toHaveLength(1)
      expect(fields[0]).toMatchObject({ name: 'welcome', type: 'json' })
    })

    it('wraps nested groups in a group named after the tab slug; leaf JSON fields keep the sub-slug name', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          onboarding: {
            type: 'object',
            properties: {
              welcome: {
                type: 'object',
                properties: { title: { type: 'string', description: 't' } },
              },
              name: {
                type: 'object',
                properties: { placeholder: { type: 'string', description: 'p' } },
              },
            },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const group = tabs[0].fields[0] as {
        type: 'group'
        name: string
        fields: [{ type: 'tabs'; tabs: Array<{ fields: Array<{ name: string }> }> }]
      }

      expect(group.type).toBe('group')
      expect(group.name).toBe('onboarding')

      const innerTabs = group.fields[0].tabs
      expect(innerTabs).toHaveLength(2)
      expect(innerTabs[0].fields[0].name).toBe('welcome')
      expect(innerTabs[1].fields[0].name).toBe('name')
    })

    it('emits TranslationsRow as the Field component, with schemaEntries + globalSlug in admin.custom', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            properties: {
              loading: { type: 'string', description: 'Loading text' },
              error: { type: 'string', description: 'Error message' },
            },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'wm-app-translations')
      const field = tabs[0].fields[0] as {
        admin?: {
          components?: { Field?: string }
          custom?: { schemaEntries?: SchemaEntry[]; globalSlug?: string }
        }
      }
      expect(field.admin?.components?.Field).toBe('@/components/admin/TranslationsRow')
      expect(field.admin?.custom?.globalSlug).toBe('wm-app-translations')
      expect(field.admin?.custom?.schemaEntries).toEqual([
        { key: 'loading', description: 'Loading text' },
        { key: 'error', description: 'Error message' },
      ])
    })

    it('threads a per-key charBudget into schemaEntries (undefined when unset)', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          emails: {
            type: 'object',
            properties: {
              online_cta: { type: 'string', description: 'Join button', charBudget: 28 },
              footer_reason: { type: 'string', description: 'Why you got this' },
            },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'sy-atlas-translations')
      const field = tabs[0].fields[0] as {
        admin?: { custom?: { schemaEntries?: SchemaEntry[] } }
      }
      const entries = field.admin?.custom?.schemaEntries ?? []
      expect(entries.find((e) => e.key === 'online_cta')?.charBudget).toBe(28)
      // A key with no budget carries none — not a default.
      expect(entries.find((e) => e.key === 'footer_reason')?.charBudget).toBeUndefined()
    })

    it('sets localized: true and no jsonSchema (Ajv breaks on Cloudflare Workers)', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            properties: { loading: { type: 'string', description: 'L' } },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const field = tabs[0].fields[0] as {
        localized?: boolean
        jsonSchema?: unknown
        validate?: unknown
      }
      expect(field.localized).toBe(true)
      expect(field.jsonSchema).toBeUndefined()
      expect(typeof field.validate).toBe('function')
    })

    it('omits the JSON field when a leaf contains only richText keys', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          legal: {
            type: 'object',
            properties: { body: { type: 'richText', description: 'Body' } },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const fields = tabs[0].fields as Array<{ name: string; type: string }>
      expect(fields).toHaveLength(1)
      expect(fields[0]).toMatchObject({ name: 'legal_body', type: 'richText' })
      expect(fields.find((f) => f.type === 'json')).toBeUndefined()
    })
  })

  describe('richText sibling fields', () => {
    it('emits one richText field per richText key, named <leafSlug>_<key>', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          welcome: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Title' },
              legal_disclaimer: { type: 'richText', description: 'Disclaimer' },
              consent_intro: { type: 'richText', description: 'Intro' },
            },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'test')
      const fields = tabs[0].fields as Array<{ name: string; type: string }>

      expect(fields.map((f) => ({ name: f.name, type: f.type }))).toEqual([
        { name: 'welcome', type: 'json' },
        { name: 'welcome_legal_disclaimer', type: 'richText' },
        { name: 'welcome_consent_intro', type: 'richText' },
      ])
      expect(fields.find((f) => f.type === 'group')).toBeUndefined()
    })

    it('registers TranslationsRichTextField as the Field component', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          welcome: {
            type: 'object',
            properties: { body: { type: 'richText', description: 'Body' } },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'wm-app-translations')
      const field = tabs[0].fields[0] as {
        admin?: {
          components?: { Field?: string }
          custom?: { translationKey?: string; globalSlug?: string; fieldType?: string }
        }
      }
      expect(field.admin?.components?.Field).toBe(
        '@/components/admin/TranslationsRow#TranslationsRichTextField',
      )
      expect(field.admin?.custom).toMatchObject({
        translationKey: 'body',
        globalSlug: 'wm-app-translations',
        fieldType: 'richText',
      })
    })
  })

  describe('screenshot field', () => {
    it('emits a UI field when the leaf group declares a screenshot', () => {
      const tabs = buildTranslationTabs(
        {
          type: 'object',
          properties: {
            welcome: {
              type: 'object',
              screenshot: 'https://figma.example/file?node-id=1-1',
              properties: { title: { type: 'string', description: 't' } },
            },
          },
        },
        'test',
      )
      const fields = tabs[0].fields as Array<{ name: string; type: string }>
      expect(fields[0]).toMatchObject({ name: 'welcome__screenshot', type: 'ui' })
      expect(fields[1]).toMatchObject({ name: 'welcome', type: 'json' })
    })
  })

  describe('validate function on the JSON field', () => {
    function getValidate(schema: TranslationsSchema, fieldName: string) {
      const tabs = buildTranslationTabs(schema, 'test')
      const field = tabs[0].fields.find(
        (f) => 'name' in f && (f as { name?: string }).name === fieldName,
      ) as { validate?: (v: unknown) => true | string } | undefined
      if (!field?.validate) throw new Error(`No validate function on field "${fieldName}"`)
      return field.validate
    }

    const baseSchema: TranslationsSchema = {
      type: 'object',
      properties: {
        common: {
          type: 'object',
          additionalProperties: false,
          properties: {
            loading: { type: 'string', description: 'L' },
            error: { type: 'string', description: 'E' },
          },
        },
      },
    }

    it('accepts undefined / null', () => {
      const validate = getValidate(baseSchema, 'common')
      expect(validate(undefined)).toBe(true)
      expect(validate(null)).toBe(true)
    })

    it('rejects non-object values', () => {
      const validate = getValidate(baseSchema, 'common')
      expect(validate('x')).toMatch(/must be a JSON object/)
      expect(validate([])).toMatch(/must be a JSON object/)
    })

    it('rejects unknown keys when additionalProperties is false', () => {
      const validate = getValidate(baseSchema, 'common')
      expect(validate({ loading: 'a', mystery: 'b' })).toMatch(/Unknown key "mystery"/)
    })

    it('accepts unknown keys when additionalProperties is true', () => {
      const flexible: TranslationsSchema = {
        type: 'object',
        properties: {
          flexible: {
            type: 'object',
            additionalProperties: true,
            properties: { known: { type: 'string', description: 'K' } },
          },
        },
      }
      const validate = getValidate(flexible, 'flexible')
      expect(validate({ known: 'x', extra: 'y' })).toBe(true)
    })

    it('rejects non-string values for declared keys', () => {
      const validate = getValidate(baseSchema, 'common')
      expect(validate({ loading: 42 })).toMatch(/must be a string/)
    })

    it('accepts a well-formed object', () => {
      const validate = getValidate(baseSchema, 'common')
      expect(validate({ loading: 'Loading', error: 'Oops' })).toBe(true)
    })

    it('accepts an object that omits some optional keys', () => {
      const validate = getValidate(baseSchema, 'common')
      expect(validate({ loading: 'Loading' })).toBe(true)
    })
  })
})
