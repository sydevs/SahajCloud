/**
 * The jsonb writes a translations global's data-only migrations are made of:
 * shipping a key's English copy, carrying a renamed key's words across, and
 * sweeping a retired key out. `src/globals/AGENTS.md` owns the first carve-out:
 * the seed files reach only a fresh database, so a new key stays blank in
 * production until somebody types it into the admin.
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

/**
 * Both rows a key has to reach, from the global's table base and the leaf
 * group's column — Payload names a localized global's value table
 * `<base>_locales` and its versions' `_<base>_v_locales`, and prefixes the
 * versions' copy of every column with `version_`.
 */
const targets = (table: string, group: string) => [
  { table: `${table}_locales`, column: group, latestOnly: sql`` },
  {
    table: `_${table}_v_locales`,
    column: `version_${group}`,
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
  { table, group, key, en }: { table: string; group: string; key: string; en: string },
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
  { table, group, key }: { table: string; group: string; key: string },
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

/**
 * Copies `from.key` into `to.key` on the same row, in every locale, where the
 * target is blank — so a key that moves keeps the words a translator chose.
 * The two groups may differ, and the version rows move with the live ones: the
 * source is swept afterwards, and a key left in a version row returns on the
 * next save.
 *
 * ⚠ `jsonb_typeof` is what keeps a non-object column out of either side: `||`
 * on a scalar builds an array, which would void the whole group.
 * `src/globals/AGENTS.md` carries why the shorter `? key` does not stand in
 * for it.
 */
export async function moveKey(
  db: Executor,
  {
    table,
    from,
    to,
  }: {
    table: string
    from: { group: string; key: string }
    to: { group: string; key: string }
  },
): Promise<void> {
  const destinations = targets(table, to.group)
  for (const [index, source] of targets(table, from.group).entries()) {
    const src = sql.identifier(source.column)
    const dst = sql.identifier(destinations[index].column)
    await db.execute(sql`
      UPDATE ${sql.identifier(source.table)}
        SET ${dst} = coalesce(${dst}, '{}'::jsonb)
          || jsonb_build_object(${to.key}::text, ${src} ->> ${from.key}::text)
        WHERE jsonb_typeof(${src}) = 'object'
          AND coalesce(${src} ->> ${from.key}::text, '') <> ''
          AND jsonb_typeof(coalesce(${dst}, '{}'::jsonb)) = 'object'
          AND coalesce(${dst} ->> ${to.key}::text, '') = ''`)
  }
}
