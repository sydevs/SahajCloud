import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// `common.a11y.menu` names WeMeditate Web's new mobile menu button (#1211). A leaf group is one
// jsonb column and `common_a11y` already exists, so there is nothing to alter — but the seed
// reaches only a fresh database, and `src/lib/translations/clientEnglishFallback.ts` fills a blank
// key for a client read *from English*, so English must actually hold it.
//
// ⚠ **`up` never overwrites a word somebody chose.** The key lands only where English lacks it.
// Of the versions, only the `latest: true` row gets it: a global's update loads the document it
// changes from that row.
//
// ⚠ **`down` sweeps wider than `up` wrote.** The previous schema does not declare the key, so a
// value left in any locale or version row refuses every later save of the global
// (`src/globals/AGENTS.md`).

const COMMON_A11Y = { main: 'common_a11y', version: 'version_common_a11y' }

const MENU = 'menu'
const MENU_EN = 'Menu'

type Db = MigrateUpArgs['db']

const targets = [
  { table: 'wm_web_translations_locales', column: COMMON_A11Y.main, latestOnly: false },
  { table: '_wm_web_translations_v_locales', column: COMMON_A11Y.version, latestOnly: true },
]

const latestOnly = (on: boolean) =>
  on
    ? sql`AND "_parent_id" IN (SELECT "id" FROM "_wm_web_translations_v" WHERE "latest")`
    : sql``

/**
 * Adds `key` where English lacks it. `jsonb_typeof` keeps a scalar column out: `||` on a
 * scalar builds an array, which would void the whole group.
 */
async function addKey(db: Db, key: string, value: string): Promise<void> {
  for (const t of targets) {
    const col = sql.identifier(t.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = coalesce(${col}, '{}'::jsonb) || jsonb_build_object(${key}::text, ${value}::text)
        WHERE "_locale" = 'en'
          AND jsonb_typeof(coalesce(${col}, '{}'::jsonb)) = 'object'
          AND NOT coalesce(${col}, '{}'::jsonb) ? ${key}::text
          ${latestOnly(t.latestOnly)}`)
  }
}

/**
 * Drops `key` from both tables, every locale and every version row. `jsonb_typeof` keeps a
 * scalar column out: `-` on one raises `cannot delete from scalar`, aborting the boot migration.
 */
async function dropKey(db: Db, key: string): Promise<void> {
  for (const t of targets) {
    const col = sql.identifier(t.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = ${col} - ${key}::text
        WHERE jsonb_typeof(${col}) = 'object'
          AND ${col} ? ${key}::text`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addKey(db, MENU, MENU_EN)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await dropKey(db, MENU)
}
