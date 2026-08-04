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
import type { GroupField, JSONField, TabsField } from 'payload'

import { describe, expect, it } from 'vitest'

import { buildTranslationTabs, type SchemaEntry, type TranslationsSchema } from '@/fields'
import { PLURAL_CATEGORIES } from '@/fields/translationsField'
import { EMAIL_STRING_DEFAULTS } from '@/lib/translations/emailStrings'

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
      const group = tabs[0].fields[0] as unknown as {
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

    it('threads a per-key maxLength into schemaEntries (undefined when unset)', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          emails: {
            type: 'object',
            properties: {
              online_cta: { type: 'string', description: 'Join button', maxLength: 28 },
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
      expect(entries.find((e) => e.key === 'online_cta')?.maxLength).toBe(28)
      // A key with no limit carries none — not a default.
      expect(entries.find((e) => e.key === 'footer_reason')?.maxLength).toBeUndefined()
    })

    it('passes a plural key to the admin as one grouped entry', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          emails: {
            type: 'object',
            properties: {
              sessions_count: {
                type: 'string',
                plural: true,
                maxLength: 18,
                description: 'Session count',
              },
            },
          },
        },
      }

      const tabs = buildTranslationTabs(schema, 'sy-atlas-translations')
      const field = tabs[0].fields[0] as {
        admin?: { custom?: { schemaEntries?: SchemaEntry[] } }
      }

      // One grouped entry, flagged plural — the admin expands it per locale.
      // (The *stored* keys are the expanded family; see the jsonSchema cases.)
      expect(field.admin?.custom?.schemaEntries).toEqual([
        { key: 'sessions_count', description: 'Session count', maxLength: 18, plural: true },
      ])
    })

    it('EMAIL_STRING_DEFAULTS covers every plural form the field builder can store', () => {
      // The field builder expands a plural key to every `PLURAL_CATEGORIES` form,
      // but `resolveEmailStrings`/`withDefaults` only preserves keys present in the
      // defaults — so an uncovered category would silently drop a translated
      // `_few`/`_many`. Guards that the two layers stay in sync.
      const pluralEmailKeys = ['sessions_count'] // keys declared `plural: true` in the emails group
      for (const base of pluralEmailKeys) {
        for (const category of PLURAL_CATEGORIES) {
          expect(EMAIL_STRING_DEFAULTS).toHaveProperty(`${base}_${category}`)
        }
      }
    })

    it('sets localized: true and leaves validation to the jsonSchema', () => {
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
      const field = tabs[0].fields[0] as JSONField

      expect(field.localized).toBe(true)
      expect(field.jsonSchema).toBeDefined()
      // A custom `validate` would *replace* Payload's built-in json validation,
      // silently disabling the schema — so the field must not declare one.
      expect(field.validate).toBeUndefined()
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

  // The group schema is projected onto the field as a `jsonSchema` (#597), which
  // Payload feeds to Ajv on write and to the TypeScript generator. These cases
  // pin the projection; `translations-globals.int.spec.ts` proves the write
  // rejection end-to-end against a real global.
  describe('jsonSchema on the JSON field', () => {
    function getJsonSchema(schema: TranslationsSchema, fieldName: string) {
      const tabs = buildTranslationTabs(schema, 'test')
      const field = tabs[0].fields.find(
        (f) => 'name' in f && (f as { name?: string }).name === fieldName,
      ) as JSONField | undefined
      if (!field?.jsonSchema) throw new Error(`No jsonSchema on field "${fieldName}"`)
      return field.jsonSchema
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

    it('declares each string key as an optional string, carrying its description', () => {
      const { schema } = getJsonSchema(baseSchema, 'common')

      expect(schema).toMatchObject({
        type: 'object',
        properties: {
          loading: { type: 'string', description: 'L' },
          error: { type: 'string', description: 'E' },
        },
      })
      // No `required` — a locale may translate any subset of its group.
      expect(schema.required).toBeUndefined()
    })

    it('forbids unknown keys unless the group opts into additionalProperties', () => {
      expect(getJsonSchema(baseSchema, 'common').schema.additionalProperties).toBe(false)

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
      expect(getJsonSchema(flexible, 'flexible').schema.additionalProperties).toBe(true)
    })

    it('declares the expanded CLDR family for a plural key, not the bare key', () => {
      const plural: TranslationsSchema = {
        type: 'object',
        properties: {
          notices: {
            type: 'object',
            properties: { day_count: { type: 'string', description: 'D', plural: true } },
          },
        },
      }
      const { schema } = getJsonSchema(plural, 'notices')

      expect(Object.keys(schema.properties ?? {})).toEqual(
        PLURAL_CATEGORIES.map((cat) => `day_count_${cat}`),
      )
      expect(schema.properties?.day_count).toBeUndefined()
    })

    it('gives every field its own schema URI, namespaced by global and group', () => {
      const nested: TranslationsSchema = {
        type: 'object',
        properties: {
          onboarding: {
            type: 'object',
            properties: {
              welcome: {
                type: 'object',
                properties: { title: { type: 'string', description: 'T' } },
              },
            },
          },
        },
      }
      const groupField = buildTranslationTabs(nested, 'wm-app-translations')[0]
        .fields[0] as GroupField
      const inner = (groupField.fields[0] as TabsField).tabs[0].fields[0] as JSONField

      expect(inner.jsonSchema?.uri).toBe(
        'https://sahajcloud.dev/schemas/translations/wm-app-translations/onboarding/welcome.json',
      )
      expect(inner.jsonSchema?.fileMatch).toEqual([inner.jsonSchema?.uri])
      expect(getJsonSchema(baseSchema, 'common').uri).toBe(
        'https://sahajcloud.dev/schemas/translations/test/common.json',
      )
    })
  })
})
