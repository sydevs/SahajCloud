import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

import { toKebabCase } from 'payload/shared'
import { z } from 'zod'

/**
 * Declares a Payload JSON column: its shape, and the four pieces of metadata
 * that shape implies.
 *
 * Payload's `jsonSchema` is `{ uri, fileMatch, schema }`, and every hand-written
 * site repeated the same string three or four times — an exported
 * `*_SCHEMA_URI`, `fileMatch: [URI]`, `$id: URI`, plus a `title` restating it in
 * PascalCase. No URI is referenced for its own sake: Payload's write validator
 * builds a fresh Ajv per call and validates against `schema` directly, and
 * `configToJSONSchema` reads only `schema` too, so `uri` and `fileMatch` reach
 * nothing but the admin's Monaco editor, which needs them merely unique. All
 * four therefore derive from `schemaTitle`, which is the only thing a caller
 * states.
 *
 * `schemaTitle` is the one that is load-bearing: it names the interface Payload
 * generates into `payload-types.ts`. Renaming a schema's `$id` renames that
 * interface only when the schema's `title` is absent, which is why this helper
 * always sets one — the derived URI is then free to change without touching a
 * generated name.
 *
 * Pass a Zod type to declare the shape inline at the field it belongs to. Pass a
 * raw {@link JSONSchema4} where the shape is **assembled as data** — properties
 * built by `Object.fromEntries`, or `enum`s spliced from an exported const
 * array — since round-tripping such a shape through Zod only to convert it back
 * buys nothing.
 *
 * **The whole field, not just its schema, is what this returns.** The two are
 * one decision: a JSON column's `type`, `uri`, `fileMatch`, `$id` and `title`
 * are all fixed the moment its shape is written down, so building the field
 * elsewhere leaves five lines a caller can only get wrong. `jsonField` is
 * therefore the only export here — there is no way to obtain a bare
 * `jsonSchema`, and so no way to attach one to a field that skipped this.
 */

/** Namespace every derived `$id` shares. Nothing dereferences it. */
const SCHEMA_URI_PREFIX = 'urn:sahajcloud:schema:'

/**
 * `z.int()` emits `minimum: -9007199254740991, maximum: 9007199254740991` — the
 * safe-integer range. `z.number().int()` emits them too, so stripping here is
 * the only way to be rid of them.
 *
 * Not cosmetic, despite looking it: Ajv enforces those bounds, so keeping them
 * would make `1e21` invalid on a column that accepts it today. Stripping is what
 * holds an integer column's behaviour still.
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
 * with — not for the `JSONSchema4` type the field is declared as, which never
 * reaches a validator.** Ajv 8 implements draft-07 and carries no draft-04
 * meta-schema. The two spell exclusive bounds differently, and only one of them
 * compiles:
 *
 * ```
 * draft-04  z.number().positive() -> { minimum: 0, exclusiveMinimum: true }
 *           Ajv 8: schema is invalid: data/exclusiveMinimum must be number
 * draft-7   z.number().positive() -> { exclusiveMinimum: 0 }          ok
 * ```
 *
 * A draft-04 target therefore hands the next author a column that fails every
 * save the first time they write `.positive()`, `.gt()` or `.lt()` — and the
 * error names a keyword nobody typed. The two draft-07 forms this changes for
 * shapes already in the tree are both no-ops: `const` where draft-04 emitted a
 * one-element `enum`, and `propertyNames: { type: 'string' }` on a record, since
 * every JSON key is a string. `payload-types.ts` regenerates byte-identically
 * either way.
 *
 * `$schema` is deleted so both overloads emit one shape: a raw {@link JSONSchema4}
 * never carries one, and what Payload stores here is a field's shape rather than
 * a standalone document, so `$id` and `title` are the only metadata that earn
 * their place. It is not a necessity — measured with the delete removed, Ajv 8
 * compiles the schema and `payload-types.ts` regenerates byte-identically.
 * (Under a draft-04 target it *was* necessary — Ajv throws `no schema with key
 * or ref` on a meta-schema it does not carry — which is the trap that made
 * draft-04 look survivable.)
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
   * The column's shape: a Zod type, or a raw {@link JSONSchema4} where the shape
   * is assembled as data.
   */
  schema: JSONSchema4 | z.ZodType
  /**
   * Names the generated interface in `payload-types.ts`, and derives the
   * schema's `uri`, `fileMatch` and `$id`. PascalCase.
   *
   * Named `schemaTitle` rather than `title` because `JSONField` has no `title`
   * of its own, and every neighbouring key here is the admin-facing field
   * config: `label` is what a person sees. This one names a type.
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
 * `Subtitles` and `Subtitles1` — the same body under two names, and a rename
 * for anyone importing the second. Interning here is what keeps a shape's
 * generated name a function of the shape, so declaring a column at its field
 * costs nothing that a shared module-level constant used to buy.
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
