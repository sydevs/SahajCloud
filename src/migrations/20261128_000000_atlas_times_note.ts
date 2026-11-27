import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// `calendar.times_note` says only what needs saying, so it fits one line on a phone: an in-person
// class in its own town's time is what a visitor assumes. A reworded key is a migration:
// `reconcileEnglishDefaults` fills an absent key and never overwrites one (`src/globals/AGENTS.md`).
// Only English is stored in production, and only where it still holds the shipped wording, so
// copy an editor changed is left alone.

const TABLE = 'sy_atlas_translations'
const GROUP = 'calendar'
const OLD = 'Times are local to each class. Online classes show your time (%{zone}).'
const NEW = 'Online class times are in your time zone (%{zone}).'

/** The live row and the version row a global's own update loads its document from. */
const TARGETS = [
  { table: `${TABLE}_locales`, column: GROUP, latestOnly: sql`` },
  {
    table: `_${TABLE}_v_locales`,
    column: `version_${GROUP}`,
    latestOnly: sql`AND "_parent_id" IN (SELECT "id" FROM ${sql.identifier(`_${TABLE}_v`)} WHERE "latest")`,
  },
]

async function reword(db: MigrateUpArgs['db'], from: string, to: string) {
  for (const target of TARGETS) {
    const col = sql.identifier(target.column)
    // ⚠ `jsonb_typeof` keeps a non-object column out: `||` on a scalar builds an array.
    await db.execute(sql`
      UPDATE ${sql.identifier(target.table)}
        SET ${col} = ${col} || jsonb_build_object('times_note'::text, ${to}::text)
        WHERE "_locale" = 'en'
          AND jsonb_typeof(${col}) = 'object'
          AND ${col} ->> 'times_note' = ${from}::text
          ${target.latestOnly}`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await reword(db, OLD, NEW)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await reword(db, NEW, OLD)
}
