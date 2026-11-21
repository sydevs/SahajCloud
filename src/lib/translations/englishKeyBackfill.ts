/**
 * The jsonb writes that ship a translations global's English copy, for the
 * data-only migrations that carry it. `src/globals/AGENTS.md` owns that
 * carve-out: the seed files reach only a fresh database, so a new key stays
 * blank in production until somebody types it into the admin.
 *
 * ⚠ **The migrations already on `main` keep their own hand copies, and must** —
 * a name with a `payload_migrations` row never runs again
 * (`src/migrations/AGENTS.md`), so rewriting them changes nothing. First
 * caller: the next such migration (#1242).
 */

import type { MigrateUpArgs } from '@payloadcms/db-postgres'

import { sql } from '@payloadcms/db-postgres'

/** A migration's own `db`, or a transaction a spec pins to one schema. */
type Executor = Pick<MigrateUpArgs['db'], 'execute'>

/** A leaf group's jsonb column, in the main locales table and in the versions one. */
type LeafGroup = { main: string; version: string }

/**
 * Both rows a key has to reach, from the global's table base — Payload names a
 * localized global's value table `<base>_locales` and its versions'
 * `_<base>_v_locales`.
 */
const targets = (table: string, group: LeafGroup) => [
  { table: `${table}_locales`, column: group.main, latestOnly: sql`` },
  {
    table: `_${table}_v_locales`,
    column: group.version,
    // Of the versions, the one row a global's own update loads its document from.
    latestOnly: sql`AND "_parent_id" IN (SELECT "id" FROM ${sql.identifier(`_${table}_v`)} WHERE "latest")`,
  },
]

/**
 * Adds `key` to a leaf group where English lacks it, never overwriting a word
 * somebody chose.
 *
 * ⚠ `jsonb_typeof` is what keeps a non-object column out: `||` on a scalar
 * builds an array, which would void the whole group. `src/globals/AGENTS.md`
 * carries why the shorter `? key` does not stand in for it.
 */
export async function addEnglishKey(
  db: Executor,
  { table, group, key, en }: { table: string; group: LeafGroup; key: string; en: string },
): Promise<void> {
  for (const target of targets(table, group)) {
    const col = sql.identifier(target.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(target.table)}
        SET ${col} = coalesce(${col}, '{}'::jsonb) || jsonb_build_object(${key}::text, ${en}::text)
        WHERE "_locale" = 'en'
          AND jsonb_typeof(coalesce(${col}, '{}'::jsonb)) = 'object'
          AND NOT coalesce(${col}, '{}'::jsonb) ? ${key}::text
          ${target.latestOnly}`)
  }
}

/**
 * Drops `key` from a leaf group in both tables, every locale and every version
 * row — a retired key left anywhere refuses every later save of the global.
 *
 * ⚠ `jsonb_typeof` is what keeps a non-object column out: `-` on a scalar
 * raises `cannot delete from scalar`, which aborts the boot migration, and on
 * an array it removes the matching element instead. `src/globals/AGENTS.md`
 * carries why the shorter `? key` does not stand in for it.
 */
export async function dropEnglishKey(
  db: Executor,
  { table, group, key }: { table: string; group: LeafGroup; key: string },
): Promise<void> {
  for (const target of targets(table, group)) {
    const col = sql.identifier(target.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(target.table)}
        SET ${col} = ${col} - ${key}::text
        WHERE jsonb_typeof(${col}) = 'object'
          AND ${col} ? ${key}::text`)
  }
}
