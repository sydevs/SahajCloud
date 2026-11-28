import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

import { toKebabCase } from 'payload/shared'
import { z } from 'zod'

/**
 * Declares a Payload JSON column: its shape, and the four pieces of metadata
 * that shape implies.
 *
 * `uri`, `fileMatch`, `$id` and `title` all derive from `schemaTitle`, the only
 * one that is load-bearing: it names the interface Payload generates into
 * `payload-types.ts`. The other three reach nothing but the admin's Monaco
 * editor, which needs them merely unique. `title` is always set — without one
 * Payload names that interface off `$id`, which would pin the derived URI.
 *
 * **The whole field, not just its schema, is what this returns**, and there is
 * no way to obtain a bare `jsonSchema`: a JSON column's metadata is all fixed
 * the moment its shape is written down, so building the field elsewhere leaves
 * five lines a caller can only get wrong.
 */

/** Namespace every derived `$id` shares. Nothing dereferences it. */
const SCHEMA_URI_PREFIX = 'urn:sahajcloud:schema:'

/**
 * `z.int()` and `z.number().int()` both emit `minimum`/`maximum` at the
 * safe-integer range, and Ajv enforces them — so keeping them would make `1e21`
 * invalid on a column that accepts it today.
 */
function stripSafeIntegerBounds(ctx: { jsonSchema: Record<string, unknown> }): void {
  const schema = ctx.jsonSchema
  if (schema.type !== 'integer') return
  if (schema.minimum === Number.MIN_SAFE_INTEGER) delete schema.minimum
  if (schema.maximum === Number.MAX_SAFE_INTEGER) delete schema.maximum
}

/** Zod 4 marks every schema instance with `_zod`; a plain JSONSchema4 has no such key. */
function isZodType(shape: z.ZodType | JSONSchema4): shape is z.ZodType {
  return typeof shape === 'object' && shape !== null && '_zod' in shape
}

/**
 * Convert a Zod type to the JSON Schema Payload can use.
 *
 * **The target is chosen for Ajv 8, which is what Payload compiles this object
 * with** — not for the `JSONSchema4` type the field is declared as, which never
 * reaches a validator. Ajv 8 implements draft-07 and carries no draft-04
 * meta-schema, and the two spell exclusive bounds differently:
 *
 * ```
 * draft-04  z.number().positive() -> { minimum: 0, exclusiveMinimum: true }
 *           Ajv 8: schema is invalid: data/exclusiveMinimum must be number
 * draft-7   z.number().positive() -> { exclusiveMinimum: 0 }          ok
 * ```
 *
 * So under draft-04 the first `.positive()`, `.gt()` or `.lt()` anyone writes
 * fails every save, naming a keyword nobody typed.
 *
 * `$schema` is deleted so both overloads emit one shape: what Payload stores
 * here is a field's shape rather than a standalone document, so `$id` and
 * `title` are the only metadata that earn their place.
 */
function fromZod(shape: z.ZodType): JSONSchema4 {
  const emitted = z.toJSONSchema(shape, {
    target: 'draft-7',
    reused: 'inline',
    override: stripSafeIntegerBounds,
  }) as Record<string, unknown>

  delete emitted.$schema

  return emitted as JSONSchema4
}

export type JsonFieldOptions = Omit<JSONField, 'jsonSchema' | 'type'> & {
  /**
   * The column's shape. A Zod type declares it inline at the field it belongs
   * to. A raw {@link JSONSchema4} is for a shape **assembled as data** —
   * properties built by `Object.fromEntries`, `enum`s spliced from a const
   * array — which round-tripping through Zod would only convert back.
   */
  schema: JSONSchema4 | z.ZodType
  /**
   * Names the generated interface in `payload-types.ts`, and derives the
   * schema's `uri`, `fileMatch` and `$id`. PascalCase.
   *
   * Not `title`: every neighbouring key here is admin-facing field config, and
   * this one names a type.
   */
  schemaTitle: string
}

/** Declare a JSON column — its shape, and everything that shape implies. */
export function jsonField({ schema, schemaTitle, ...field }: JsonFieldOptions): JSONField {
  const slug = toKebabCase(schemaTitle)
  if (!slug)
    throw new Error(`jsonField: a schemaTitle is required, got ${JSON.stringify(schemaTitle)}`)

  const uri = `${SCHEMA_URI_PREFIX}${slug}`
  const body = isZodType(schema) ? fromZod(schema) : schema

  return { ...field, type: 'json', jsonSchema: shared(uri, schemaTitle, body) }
}

/**
 * One object per distinct shape, reused by every field that declares it.
 *
 * **Payload names its generated interfaces off object identity, not off the
 * `title`.** Two columns handed equal-but-separate `jsonSchema` objects get
 * `Subtitles` and `Subtitles1` — the same body under two names.
 *
 * Keyed by body as well as URI, so two *different* shapes on one URI stay two
 * objects and `tests/unit/json-field-helper.spec.ts` still catches them.
 */
const interned = new Map<string, NonNullable<JSONField['jsonSchema']>>()

function shared(
  uri: string,
  title: string,
  body: JSONSchema4,
): NonNullable<JSONField['jsonSchema']> {
  // `$id` and `title` last: a raw schema carrying either of its own is being
  // migrated, and the derived pair is what the rest of this object agrees with.
  const schema = { ...body, $id: uri, title }
  const key = JSON.stringify(schema)

  const already = interned.get(key)
  if (already) return already

  const built = { uri, fileMatch: [uri], schema }
  interned.set(key, built)
  return built
}
