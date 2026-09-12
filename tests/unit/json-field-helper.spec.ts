import type { JSONSchema4 } from 'json-schema'
import type { Field, JSONField } from 'payload'

import { json as jsonFieldValidation, toKebabCase } from 'payload/shared'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { collections } from '@/collections'
import { jsonField } from '@/fields/jsonField'
import { globals } from '@/globals'
import { TableOfContentsBlock } from '@/lib/richEditor/blocks/TableOfContentsBlock'

/**
 * #726: one helper declares every JSON column in `src/`, deriving `uri`,
 * `fileMatch`, `$id` and `title` from a single title.
 *
 * The cases that matter are the two with a failure mode nothing else catches:
 * the emission target Ajv compiles under, and two columns colliding on one
 * derived URI.
 */

/** Payload's built-in validator, with the minimum context it reads. */
const req = { t: (key: string) => key } as never

function runSchema(schema: NonNullable<JSONField['jsonSchema']>, value: unknown): unknown {
  return jsonFieldValidation(
    value as never,
    {
      jsonSchema: schema,
      req,
      required: false,
    } as never,
  )
}

/** The `jsonSchema` a declared field carries — what every case below reads. */
function built(schemaTitle: string, schema: JSONSchema4 | z.ZodType) {
  return jsonField({ name: 'probe', schemaTitle, schema }).jsonSchema as NonNullable<
    JSONField['jsonSchema']
  >
}

describe('jsonField', () => {
  it('declares a JSON column, not just its schema', () => {
    const field = jsonField({ name: 'frames', schemaTitle: 'MeditationFrames', schema: z.string() })

    expect(field.type).toBe('json')
    expect(field.name).toBe('frames')
  })

  it('derives all four fields from the title alone', () => {
    const schema = built('MeditationFrames', z.array(z.looseObject({})))

    expect(schema.uri).toBe('urn:sahajcloud:schema:meditation-frames')
    expect(schema.fileMatch).toEqual(['urn:sahajcloud:schema:meditation-frames'])
    expect(schema.schema.$id).toBe('urn:sahajcloud:schema:meditation-frames')
    expect(schema.schema.title).toBe('MeditationFrames')
  })

  it('refuses a schemaTitle that derives no slug', () => {
    expect(() => built('', z.string())).toThrow(/schemaTitle is required/)
  })

  it('overrides an $id or title a raw schema brought with it', () => {
    const schema = built('ClientAbuseScore', {
      $id: 'urn:stale:id',
      title: 'Stale',
      type: 'object',
    })

    expect(schema.schema.$id).toBe('urn:sahajcloud:schema:client-abuse-score')
    expect(schema.schema.title).toBe('ClientAbuseScore')
  })

  it('keeps a raw JSON Schema verbatim, for what Zod cannot express', () => {
    // `maxProperties` and a bare `enum` with no `type` beside it are the two
    // shapes in this tree that need the escape hatch.
    const schema = built('UserMessageContext', {
      type: 'object',
      maxProperties: 20,
      properties: { verdict: { enum: ['ok', 'spam'] } },
    })

    expect(schema.schema.maxProperties).toBe(20)
    expect(schema.schema.properties?.verdict).toEqual({ enum: ['ok', 'spam'] })
  })

  describe('the Zod overload', () => {
    it('strips the $schema Zod emits, so both overloads emit one shape', () => {
      // Measured with the strip removed: both `runSchema` calls below still
      // pass — Ajv 8 resolves the draft-07 meta-schema — and
      // `payload-types.ts` regenerates byte-identically. So the strip is a
      // consistency choice, and the first assertion is the only one that
      // reddens: a raw-overload schema carries no `$schema`, so neither may a
      // Zod one. Under a draft-04 target the strip was a necessity instead;
      // `fromZod` carries that story.
      const schema = built('ProbeShape', z.strictObject({ a: z.string() }))

      expect(schema.schema.$schema).toBeUndefined()
      expect(runSchema(schema, { a: 'ok' })).toBe(true)
      expect(runSchema(schema, { a: 7 })).not.toBe(true)
    })

    it('emits an exclusive bound Ajv can actually compile', () => {
      // This pins the emission TARGET, which is the one setting with a failure
      // mode nothing else catches. Ajv 8 carries no draft-04 meta-schema and
      // spells exclusive bounds as numbers:
      //
      //   draft-04  .positive() -> { minimum: 0, exclusiveMinimum: true }
      //             Ajv: schema is invalid: data/exclusiveMinimum must be number
      //   draft-7   .positive() -> { exclusiveMinimum: 0 }
      //
      // Under draft-04 the throw lands on every save of the column, naming a
      // keyword nobody wrote. Switching the target back turns this case red.
      const schema = built('ProbeBounds', z.strictObject({ n: z.number().positive() }))
      const n = (schema.schema.properties as Record<string, Record<string, unknown>>).n

      expect(n.exclusiveMinimum).toBe(0)
      expect(n.minimum).toBeUndefined()
      expect(runSchema(schema, { n: 1 })).toBe(true)
      expect(runSchema(schema, { n: 0 })).not.toBe(true)
    })

    it('strips the safe-integer bounds z.int() emits, at any depth', () => {
      const schema = built('ProbeInts', z.array(z.strictObject({ id: z.int() })))
      const id = (schema.schema.items as { properties: { id: Record<string, unknown> } }).properties
        .id

      expect(id).toEqual({ type: 'integer' })
      expect(runSchema(schema, [{ id: 3 }])).toBe(true)
      expect(runSchema(schema, [{ id: 'three' }])).not.toBe(true)
    })
  })
})

type JsonColumn = { path: string; jsonSchema: NonNullable<JSONField['jsonSchema']> }

/** Walk the containers Payload nests fields in, collecting every JSON column. */
function collectJsonColumns(fields: Field[], path: string, into: JsonColumn[]) {
  for (const field of fields) {
    const name = 'name' in field && field.name ? `${path}.${field.name}` : path
    if (field.type === 'json' && field.jsonSchema)
      into.push({ path: name, jsonSchema: field.jsonSchema })
    if ('fields' in field && Array.isArray(field.fields))
      collectJsonColumns(field.fields, name, into)
    if (field.type === 'tabs')
      for (const tab of field.tabs) collectJsonColumns(tab.fields, name, into)
    if (field.type === 'blocks')
      for (const block of field.blocks) {
        // Payload 3 also allows a `blockReferences` slug string here.
        if (typeof block !== 'object' || !Array.isArray(block.fields)) continue
        collectJsonColumns(block.fields, `${name}.${block.slug}`, into)
      }
  }
}

describe('derived URIs across the config', () => {
  const columns: JsonColumn[] = []
  for (const collection of collections)
    collectJsonColumns(collection.fields, collection.slug, columns)
  for (const global of globals) collectJsonColumns(global.fields, global.slug, columns)
  // A block registered in a Lexical editor hangs off the editor's config, not
  // off any field's `blocks`, so walking the collections never reaches it —
  // `TableOfContentsHeadings` would sit outside the invariant below.
  collectJsonColumns(TableOfContentsBlock.fields, `block.${TableOfContentsBlock.slug}`, columns)

  it('finds the JSON columns, so the assertions below are not vacuous', () => {
    expect(columns.length).toBeGreaterThan(20)
  })

  it('derives every URI from the schema title', () => {
    // What catches a hand-written `jsonSchema` that bypassed the helper: its
    // URI would no longer be a pure function of its title.
    for (const { path, jsonSchema } of columns) {
      const title = jsonSchema.schema.title
      expect(typeof title, `${path} declares no title`).toBe('string')
      expect(jsonSchema.uri, path).toBe(`urn:sahajcloud:schema:${toKebabCase(title as string)}`)
      expect(jsonSchema.fileMatch, path).toEqual([jsonSchema.uri])
      expect(jsonSchema.schema.$id, path).toBe(jsonSchema.uri)
    }
  })

  it('gives one shape one object, so Payload names its interface once', () => {
    // Payload names a generated interface off the schema OBJECT, not the
    // title: hand two columns equal-but-separate objects and it emits
    // `Subtitles` and `Subtitles1`, the same body under two names. Drop the
    // interning in `jsonField` and this reddens — `subtitles` (×3),
    // `upcomingDates` (×2) and the four Meditations join columns each split.
    const objectsByBody = new Map<string, Set<NonNullable<JSONField['jsonSchema']>>>()
    for (const { jsonSchema } of columns) {
      const body = JSON.stringify(jsonSchema.schema)
      const objects = objectsByBody.get(body) ?? new Set()
      objects.add(jsonSchema)
      objectsByBody.set(body, objects)
    }

    for (const [body, objects] of objectsByBody) {
      const title = (JSON.parse(body) as { title: string }).title
      expect(objects.size, `${title} is declared as ${objects.size} separate objects`).toBe(1)
    }
  })

  it('never gives one URI two different shapes', () => {
    // Two columns sharing a title merge into one Monaco entry and one generated
    // interface. Sharing a schema on purpose is fine — the four `fileMetadata`
    // columns and the four Meditations join columns each reuse one object — so
    // the collision that matters is one URI carrying two different bodies.
    const shapesByUri = new Map<string, Map<string, string[]>>()
    for (const { path, jsonSchema } of columns) {
      const shapes = shapesByUri.get(jsonSchema.uri) ?? new Map<string, string[]>()
      const body = JSON.stringify(jsonSchema.schema)
      shapes.set(body, [...(shapes.get(body) ?? []), path])
      shapesByUri.set(jsonSchema.uri, shapes)
    }

    for (const [uri, shapes] of shapesByUri) {
      const owners = [...shapes.values()].map((paths) => paths.join(' + '))
      expect(shapes.size, `${uri} carries ${shapes.size} shapes: ${owners.join(' vs ')}`).toBe(1)
    }
  })
})
