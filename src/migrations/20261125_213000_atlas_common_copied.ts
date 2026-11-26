import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Sahaj Atlas's `share.copied` ("Copied") retires for `common.chrome.copied`: one generic
// confirmation now serves the share link, the contact popover and a class's address. Both keys
// live in groups that keep other keys, so the columns stay and the value moves inside them.
// The schema declares `additionalProperties: false`, so a `share.copied` left in any locale or
// version row refuses every later save of the global (`src/globals/AGENTS.md`).
//
// Up copies each row's `share.copied` into `common_chrome.copied` where that is blank — a
// translator's or seeded copy is kept — then sweeps `share.copied` out. Down copies it back,
// sweeps `common_chrome.copied` (the previous schema refuses it), and restores English
// `share.copied` where it is still absent.

type Db = MigrateUpArgs['db']

const TABLES = [
  { table: 'sy_atlas_translations_locales', prefix: '' },
  { table: '_sy_atlas_translations_v_locales', prefix: 'version_' },
]

/**
 * Copies `from.fromKey` into `to.toKey` on the same row where the target is blank. `jsonb_typeof`
 * keeps a scalar column out: `||` on a scalar builds an array, which would void the whole group.
 */
async function moveKey(
  db: Db,
  from: { column: string; key: string },
  to: { column: string; key: string },
): Promise<void> {
  for (const t of TABLES) {
    const src = sql.identifier(`${t.prefix}${from.column}`)
    const dst = sql.identifier(`${t.prefix}${to.column}`)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${dst} = coalesce(${dst}, '{}'::jsonb)
          || jsonb_build_object(${to.key}::text, ${src} ->> ${from.key}::text)
        WHERE jsonb_typeof(${src}) = 'object'
          AND coalesce(${src} ->> ${from.key}::text, '') <> ''
          AND jsonb_typeof(coalesce(${dst}, '{}'::jsonb)) = 'object'
          AND coalesce(${dst} ->> ${to.key}::text, '') = ''`)
  }
}

/**
 * Drops `key` from both tables, every locale and every version row. `jsonb_typeof` keeps a
 * scalar column out: `-` on one raises `cannot delete from scalar`, aborting the boot migration.
 */
async function dropKey(db: Db, column: string, key: string): Promise<void> {
  for (const t of TABLES) {
    const col = sql.identifier(`${t.prefix}${column}`)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = ${col} - ${key}::text
        WHERE jsonb_typeof(${col}) = 'object'
          AND ${col} ? ${key}::text`)
  }
}

/** Adds English `key` where the English row lacks it (same scalar guard as above). */
async function addEnglish(db: Db, column: string, key: string, value: string): Promise<void> {
  for (const t of TABLES) {
    const col = sql.identifier(`${t.prefix}${column}`)
    const latest =
      t.prefix === ''
        ? sql``
        : sql`AND "_parent_id" IN (SELECT "id" FROM "_sy_atlas_translations_v" WHERE "latest")`
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = coalesce(${col}, '{}'::jsonb) || jsonb_build_object(${key}::text, ${value}::text)
        WHERE "_locale" = 'en'
          AND jsonb_typeof(coalesce(${col}, '{}'::jsonb)) = 'object'
          AND NOT coalesce(${col}, '{}'::jsonb) ? ${key}::text
          ${latest}`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await moveKey(db, { column: 'share', key: 'copied' }, { column: 'common_chrome', key: 'copied' })
  await dropKey(db, 'share', 'copied')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await moveKey(db, { column: 'common_chrome', key: 'copied' }, { column: 'share', key: 'copied' })
  await dropKey(db, 'common_chrome', 'copied')
  await addEnglish(db, 'share', 'copied', 'Copied')
}
