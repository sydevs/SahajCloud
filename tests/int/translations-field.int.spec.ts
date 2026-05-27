/**
 * Tests for buildTranslationTabs() — the factory that converts a nested JSON
 * schema into PayloadCMS tabs. After issue #414 each leaf group emits one
 * localized JSON field (for its string keys, rendered as rows by
 * TranslationsRow) plus one richText field per richText key. The legacy
 * `group` wrapper and `strings` sub-field are gone. The shared review row
 * (`markReviewed` + `lastReviewedAt`) and `translationReviewHook` apply to
 * all three translation globals.
 *
 * Why JSON-per-leaf instead of a column-per-key: SQLite's `json_array()`
 * argument limit (~100) breaks `findGlobal` once a single global has too
 * many flat localized columns. wm-app-translations has ~478 leaf keys, which
 * a column-per-key design blows past.
 */
import { describe, expect, it } from 'vitest'

import {
  buildTranslationTabs,
  translationReviewFields,
  translationReviewHook,
  type SchemaEntry,
  type TranslationsSchema,
} from '@/fields'

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

    it('flattens nested groups into {parent}_{child} JSON field names', () => {
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
      const innerTabs = (tabs[0].fields[0] as { type: 'tabs'; tabs: Array<{ fields: Array<{ name: string }> }> })
        .tabs

      expect(innerTabs).toHaveLength(2)
      expect(innerTabs[0].fields[0].name).toBe('onboarding_welcome')
      expect(innerTabs[1].fields[0].name).toBe('onboarding_name')
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
      const field = tabs[0].fields[0] as { localized?: boolean; jsonSchema?: unknown; validate?: unknown }
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

    it('registers RichTextReference as the Description component', () => {
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
          components?: { Description?: string }
          custom?: { translationKey?: string; globalSlug?: string; fieldType?: string }
        }
      }
      expect(field.admin?.components?.Description).toBe(
        '@/components/admin/TranslationsRow#RichTextReference',
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

describe('translationReviewFields', () => {
  it('exposes a single row containing markReviewed + lastReviewedAt', () => {
    expect(translationReviewFields).toHaveLength(1)
    const row = translationReviewFields[0] as {
      type: string
      fields: Array<{ name: string; type: string; localized?: boolean; virtual?: boolean }>
    }
    expect(row.type).toBe('row')
    expect(row.fields.map((f) => f.name)).toEqual(['markReviewed', 'lastReviewedAt'])
    expect(row.fields[0]).toMatchObject({ type: 'checkbox', localized: true, virtual: true })
    expect(row.fields[1]).toMatchObject({ type: 'date', localized: true })
  })
})

describe('translationReviewHook', () => {
  it('sets lastReviewedAt and clears markReviewed when checked', () => {
    const data: Record<string, unknown> = { markReviewed: true }
    const out = translationReviewHook({ data } as Parameters<typeof translationReviewHook>[0])
    expect(out.markReviewed).toBe(false)
    expect(typeof out.lastReviewedAt).toBe('string')
    expect(() => new Date(out.lastReviewedAt as string).toISOString()).not.toThrow()
  })

  it('leaves data unchanged when markReviewed is not set', () => {
    const data: Record<string, unknown> = { somethingElse: 'untouched' }
    const out = translationReviewHook({ data } as Parameters<typeof translationReviewHook>[0])
    expect(out.markReviewed).toBeUndefined()
    expect(out.lastReviewedAt).toBeUndefined()
    expect(out.somethingElse).toBe('untouched')
  })
})
