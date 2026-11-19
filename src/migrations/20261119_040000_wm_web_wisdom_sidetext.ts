import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// The ornate text box spelled its decorative side label in English for every locale, from a
// default parameter the frontend's copy lint cannot see (sydevs/WeMeditateWeb#262). This ships the
// English string its `useT()` call reads, which the seed reaches only on a fresh database.
//
// ⚠ **`up` never overwrites a word somebody chose.** The key lands only where English lacks it.
// Of the versions, only the `latest: true` row gets it: a global's update loads the document it
// changes from that row.
//
// ⚠ **`down` drops it wherever it sits, whatever it holds.** The previous schema does not declare
// the key, and a stored undeclared key makes `additionalProperties: false` refuse every later save
// of the global (`src/globals/AGENTS.md`).

const BLOCKS_GENERAL = { main: 'blocks_general', version: 'version_blocks_general' }

const KEY = 'wisdom_sidetext'
const KEY_EN = 'Ancient Wisdom'

type Db = MigrateUpArgs['db']

const targets = [
  { table: 'wm_web_translations_locales', column: BLOCKS_GENERAL.main, latestOnly: false },
  { table: '_wm_web_translations_v_locales', column: BLOCKS_GENERAL.version, latestOnly: true },
]

const latestOnly = (on: boolean) =>
  on
    ? sql`AND "_parent_id" IN (SELECT "id" FROM "_wm_web_translations_v" WHERE "latest")`
    : sql``

/**
 * Adds the key where English lacks it. `jsonb_typeof` keeps a scalar column out: the concatenation
 * on a scalar builds an array, which would void the whole group.
 */
async function addKey(db: Db, value: string): Promise<void> {
  for (const t of targets) {
    const col = sql.identifier(t.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = coalesce(${col}, '{}'::jsonb) || jsonb_build_object(${KEY}::text, ${value}::text)
        WHERE "_locale" = 'en'
          AND jsonb_typeof(coalesce(${col}, '{}'::jsonb)) = 'object'
          AND NOT coalesce(${col}, '{}'::jsonb) ? ${KEY}::text
          ${latestOnly(t.latestOnly)}`)
  }
}

/**
 * Drops the key from both tables, every locale and every version row. The containment test is what
 * keeps a scalar column out — it is false for every scalar, so the delete, which would raise
 * cannot-delete-from-scalar there, never reaches one (`src/globals/AGENTS.md`).
 */
async function dropKey(db: Db): Promise<void> {
  for (const t of targets) {
    const col = sql.identifier(t.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = ${col} - ${KEY}::text
        WHERE ${col} ? ${KEY}::text`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addKey(db, KEY_EN)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await dropKey(db)
}
