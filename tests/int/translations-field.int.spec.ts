/**
 * Tests for buildTranslationTabs() — the factory that converts a nested JSON
 * schema into PayloadCMS tabs. After issue #414 each leaf group emits one
 * localized JSON field (for its string keys, rendered as rows by
 * TranslationsRow) plus one richText field per richText key. The legacy
 * `group` wrapper and `strings` sub-field are gone.
 *
 * Why JSON-per-leaf instead of a column-per-key: this design dates to
 * Cloudflare D1 (SQLite), whose `json_array()` argument limit (~100) broke
 * `findGlobal` once a global had too many flat localized columns.
 * wm-app-translations has ~478 leaf keys, well past what a column-per-key
 * design allows. The shape carried over unchanged after the move to Postgres.
 */
import { describe, expect, it } from 'vitest'

import { buildTranslationTabs, type SchemaEntry, type TranslationsSchema } from '@/fields'
import { EMAIL_STRING_DEFAULTS } from '@/lib/translations/emailStrings'
import { PLURAL_CATEGORIES } from '@/lib/translations/pluralCategories'

/** The emitted JSON Schema, as much of it as these assertions read. */
interface JsonSchemaObject {
  $id: string
  title: string
  type: string
  additionalProperties: boolean
  required?: string[]
  properties: Record<string, { type: string; description?: string; maxLength?: number }>
}

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

    it('wraps nested groups in a group named after the tab slug, one collapsible per sub-group', () => {
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
        fields: Array<{
          type: string
          label: string
          admin?: { initCollapsed?: boolean }
          fields: Array<{ name: string }>
        }>
      }

      expect(group.type).toBe('group')
      expect(group.name).toBe('onboarding')

      // Collapsibles, not an inner tabs row (#705). Tabs inside tabs hide every
      // sub-group but one, which is the wrong shape for a translator working
      // down a page. The data path is `onboarding.welcome` either way, so this
      // is presentational only and needs no migration.
      const collapsibles = group.fields
      expect(collapsibles.map((f) => f.type)).toEqual(['collapsible', 'collapsible'])
      expect(collapsibles.map((f) => f.label)).toEqual(['Welcome', 'Name'])
      expect(collapsibles[0].fields[0].name).toBe('welcome')
      expect(collapsibles[1].fields[0].name).toBe('name')
      expect(collapsibles.every((f) => f.admin?.initCollapsed === false)).toBe(true)
    })

    // Accessibility strings are long, rarely edited, and would push the visible
    // copy off the screen.
    it('starts an a11y sub-group collapsed, and every other sub-group open', () => {
      const schema: TranslationsSchema = {
        type: 'object',
        properties: {
          map: {
            type: 'object',
            properties: {
              general: {
                type: 'object',
                properties: { zoom_in: { type: 'string', description: 'z' } },
              },
              a11y: {
                type: 'object',
                properties: { marker: { type: 'string', description: 'm' } },
              },
            },
          },
        },
      }

      const group = buildTranslationTabs(schema, 'test')[0].fields[0] as unknown as {
        fields: Array<{ label: string; admin?: { initCollapsed?: boolean } }>
      }
      expect(group.fields.map((f) => [f.label, f.admin?.initCollapsed])).toEqual([
        ['General', false],
        ['A11y', true],
      ])
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

    it('expands a plural key into its CLDR family for storage + validation', () => {
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
        jsonSchema?: { schema: JsonSchemaObject }
      }

      // One grouped entry, flagged plural — the admin expands it per locale.
      expect(field.admin?.custom?.schemaEntries).toEqual([
        {
          key: 'sessions_count',
          description: 'Session count',
          maxLength: 18,
          strict: undefined,
          plural: true,
        },
      ])

      // Storage, and therefore validation, sees the expanded category keys and
      // not the bare base — the base would be an unknown key.
      expect(Object.keys(field.jsonSchema!.schema.properties)).toEqual([
        'sessions_count_one',
        'sessions_count_few',
        'sessions_count_many',
        'sessions_count_other',
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

    // Supplying a `validate` REPLACES Payload's built-in `json` validator, which
    // is the one bound to `jsonSchema`. The one here therefore COMPOSES it: it
    // adds back the array check the built-in short-circuits past, then
    // delegates. A validate that did not delegate would switch the schema off.
    it('sets localized: true, a jsonSchema, and a validate that composes the built-in', () => {
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
      expect(field.jsonSchema).toBeDefined()

      // `[]` is the gap: Payload's built-in short-circuits on an "empty" value
      // and counts an empty array as empty, so an array would reach a column
      // whose generated type is an object.
      const validate = field.validate as (v: unknown, args: unknown) => unknown
      expect(validate([], {})).toMatch(/must be a JSON object/)
      // Anything else is the built-in's answer, not ours — `undefined` is
      // accepted, which is what the built-in returns for an empty value.
      expect(validate(undefined, { req: { t: () => '' } })).toBe(true)
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

  describe('jsonSchema on the JSON field', () => {
    function getSchema(schema: TranslationsSchema, fieldName: string): JsonSchemaObject {
      const tabs = buildTranslationTabs(schema, 'sy-atlas-translations')
      const field = tabs[0].fields.find(
        (f) => 'name' in f && (f as { name?: string }).name === fieldName,
      ) as { jsonSchema?: { uri: string; fileMatch: string[]; schema: JsonSchemaObject } }
      if (!field?.jsonSchema) throw new Error(`No jsonSchema on field "${fieldName}"`)
      expect(field.jsonSchema.fileMatch).toEqual([field.jsonSchema.uri])
      expect(field.jsonSchema.schema.$id).toBe(field.jsonSchema.uri)
      return field.jsonSchema.schema
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

    it('declares every string key, typed and described', () => {
      expect(getSchema(baseSchema, 'common').properties).toEqual({
        loading: { type: 'string', description: 'L' },
        error: { type: 'string', description: 'E' },
      })
    })

    // Payload validates a stored column on EVERY save of its document. A
    // `required` key would make a locale that predates it unsaveable, on a save
    // that never touched translations.
    it('marks no property required, so a partial locale still saves', () => {
      expect(getSchema(baseSchema, 'common').required).toBeUndefined()
    })

    it('closes the shape when additionalProperties is false', () => {
      expect(getSchema(baseSchema, 'common').additionalProperties).toBe(false)
    })

    it('leaves the shape open when additionalProperties is true', () => {
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
      expect(getSchema(flexible, 'flexible').additionalProperties).toBe(true)
    })

    // Advisory by default: emitting the limit would turn every key already over
    // it into a refused save, on a document nobody edited.
    it('emits maxLength only for a strict key', () => {
      const limits: TranslationsSchema = {
        type: 'object',
        properties: {
          emails: {
            type: 'object',
            properties: {
              advisory: { type: 'string', description: 'A', maxLength: 28 },
              blocking: { type: 'string', description: 'B', maxLength: 12, strict: true },
            },
          },
        },
      }
      expect(getSchema(limits, 'emails').properties).toEqual({
        advisory: { type: 'string', description: 'A' },
        blocking: { type: 'string', description: 'B', maxLength: 12 },
      })
    })

    // Payload runs Ajv 8 in strict mode, where an unknown keyword throws at
    // VALIDATE time, not at boot — so a leaked extension would surface as a
    // failed save in production rather than a failed build.
    it('leaks no non-standard keyword from the source schema', () => {
      const extended: TranslationsSchema = {
        type: 'object',
        properties: {
          emails: {
            type: 'object',
            screenshot: '/shots/emails.png',
            properties: {
              count: { type: 'string', description: 'C', plural: true, maxLength: 8, strict: true },
            },
          },
        },
      }
      const emitted = getSchema(extended, 'emails')
      const serialized = JSON.stringify(emitted)
      for (const keyword of ['plural', 'screenshot', 'strict']) {
        expect(serialized).not.toContain(`"${keyword}"`)
      }
      expect(Object.keys(emitted).sort()).toEqual([
        '$id',
        'additionalProperties',
        'properties',
        'title',
        'type',
      ])
    })

    // The generated interface takes its name from `title`, so a collision would
    // silently merge two unrelated groups' types.
    it('names the interface after the global, parent group and leaf', () => {
      expect(getSchema(baseSchema, 'common').title).toBe('SyAtlasTranslationsCommonStrings')

      const nested: TranslationsSchema = {
        type: 'object',
        properties: {
          map: {
            type: 'object',
            properties: {
              a11y: { type: 'object', properties: { label: { type: 'string', description: 'L' } } },
            },
          },
        },
      }
      const tabs = buildTranslationTabs(nested, 'wm-web-translations')
      const group = tabs[0].fields[0] as { fields: { fields: { jsonSchema?: { schema: JsonSchemaObject } }[] }[] }
      expect(group.fields[0].fields[0].jsonSchema!.schema.title).toBe(
        'WmWebTranslationsMapA11yStrings',
      )
    })
  })
})
