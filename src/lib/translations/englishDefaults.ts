/**
 * The English copy a translations schema declares, and the one pass that puts
 * it into a database that already exists.
 *
 * A seed file reaches a fresh database only, so every new key used to ship a
 * hand-written data-only migration of its own — three near-identical ones in
 * the 48 hours before this replaced them (#1218). The copy is declared beside
 * the key instead, as `default` in `translationsSchema.json`, and read twice:
 * by the seed importer for a fresh database, and by
 * {@link reconcileEnglishDefaults} on every boot for one that already holds the
 * global.
 *
 * ⚠ **A key already present is never touched, whatever it holds.** The
 * reconciliation runs on every boot, so filling a *blank* English value would
 * overwrite an operator who deliberately emptied one, again at every restart.
 * Absence is the only gap it fills.
 *
 * ⚠ **English alone.** Every other locale resolves through
 * `clientEnglishFallback`, so a default written into `fr` would be a
 * translation nobody made, indistinguishable from one somebody did.
 */

import type { Payload } from 'payload'

import { sql } from '@payloadcms/db-postgres/drizzle'

import { quotedDbSchema } from '@/plugins/usage'

import { collectLeafLookups, isObjectNode, type SchemaNode } from './schemaWalker'

export type DefaultsSchema = { properties?: Record<string, SchemaNode> }

/** A translations global and the schema that declares its keys. */
export interface TranslationsTarget {
  slug: string
  schema: DefaultsSchema
}

/** One leaf group's declared English, keyed by storage key. */
export interface ColumnDefaults {
  /** The Drizzle column holding the group's JSON blob (`blocks_general`). */
  column: string
  values: Record<string, string>
}

/**
 * Every declared English value in one schema, grouped by the column that stores
 * it.
 *
 * The column name is the leaf group's field path: a nested tab stores
 * `<tab>_<sub-group>`, a flat tab stores `<tab>`. `collectLeafLookups` owns
 * that nesting rule for every other reader, so it owns it here too.
 */
export function collectColumnDefaults(schema: DefaultsSchema): ColumnDefaults[] {
  const byColumn = new Map<string, Record<string, string>>()

  for (const [tabSlug, node] of Object.entries(schema.properties ?? {})) {
    if (!isObjectNode(node)) continue
    for (const lookup of collectLeafLookups(tabSlug, node)) {
      if (lookup.innerKey === null || lookup.englishDefault === undefined) continue
      const column =
        lookup.groupField === null ? lookup.fieldName : `${lookup.groupField}_${lookup.fieldName}`
      const values = byColumn.get(column) ?? {}
      values[lookup.innerKey] = lookup.englishDefault
      byColumn.set(column, values)
    }
  }

  return [...byColumn].map(([column, values]) => ({ column, values }))
}

/**
 * `data` with every declared English value it does not already carry.
 *
 * What the seed importer writes for English: the committed corpus wins wherever
 * it has a value, and a key declared only in the schema is written beside it.
 * Blank counts as absent here — a seed run is the deliberate act the boot-time
 * reconciliation is not, so it is the one writer allowed to fill an emptied key.
 *
 * Returns a copy. A leaf group's JSON column is replaced wholesale on write, so
 * the merge has to hand back the whole group, never just the added keys.
 */
export function withEnglishDefaults(
  data: Record<string, unknown>,
  schema: DefaultsSchema,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...data }

  for (const [tabSlug, node] of Object.entries(schema.properties ?? {})) {
    if (!isObjectNode(node)) continue
    for (const lookup of collectLeafLookups(tabSlug, node)) {
      if (lookup.innerKey === null || lookup.englishDefault === undefined) continue

      const parent =
        lookup.groupField === null
          ? merged
          : (merged[lookup.groupField] = { ...asRecord(merged[lookup.groupField]) })
      const leaf = (parent[lookup.fieldName] = { ...asRecord(parent[lookup.fieldName]) })

      const current = leaf[lookup.innerKey]
      if (typeof current === 'string' && current.trim().length > 0) continue
      leaf[lookup.innerKey] = lookup.englishDefault
    }
  }

  return merged
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** One statement's worth of Drizzle. */
interface Executor {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>
}

/**
 * Fill one column's absent keys, on the main row and on the version row a save
 * reloads from.
 *
 * `defaults || stored` keeps every stored key: the right operand of `||` wins,
 * so a value somebody typed survives and an absent one takes the default. The
 * `?&` test is what keeps the write off rows with nothing to gain, since a
 * no-op `UPDATE` still writes a row version.
 *
 * `jsonb_typeof` keeps a scalar column out, where the concatenation would build
 * an array and void the whole group.
 */
function fillColumn(table: string, column: string, json: string, latestOnly: string | null) {
  const col = sql.raw(`"${column}"`)
  const stored = sql`coalesce(${col}, '{}'::jsonb)`
  return sql`
    UPDATE ${sql.raw(table)}
       SET ${col} = ${json}::jsonb || ${stored}
     WHERE "_locale" = 'en'
       AND jsonb_typeof(${stored}) = 'object'
       AND NOT ${stored} ?& ARRAY(SELECT jsonb_object_keys(${json}::jsonb))
       ${latestOnly === null ? sql`` : sql.raw(latestOnly)}`
}

/**
 * Write every schema-declared English value that the database does not hold.
 *
 * Runs on every boot, after migrations, and is a no-op whenever the stored copy
 * is already complete — which is every boot but the one that follows a deploy
 * adding a key. A global with no `default` anywhere costs no statement at all.
 *
 * Returns the number of statements it ran, for the caller's log line.
 */
export async function reconcileEnglishDefaults(
  payload: Payload,
  targets: TranslationsTarget[],
): Promise<number> {
  const executor = (payload.db as unknown as { drizzle: Executor }).drizzle
  const schema = quotedDbSchema(payload)
  let statements = 0

  for (const target of targets) {
    const base = target.slug.replace(/-/g, '_')
    for (const { column, values } of collectColumnDefaults(target.schema)) {
      const json = JSON.stringify(values)
      await executor.execute(fillColumn(`${schema}."${base}_locales"`, column, json, null))
      await executor.execute(
        fillColumn(
          `${schema}."_${base}_v_locales"`,
          `version_${column}`,
          json,
          `AND "_parent_id" IN (SELECT "id" FROM ${schema}."_${base}_v" WHERE "latest")`,
        ),
      )
      statements += 2
    }
  }

  return statements
}
