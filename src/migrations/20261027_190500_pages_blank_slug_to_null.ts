import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Settles the blank slugs `pages` stored before `slugField` did (#1038,
// #1040): the configured home page holds `''`, every other blank is NULL —
// Postgres admits one `''` under the unique index. Non-home rows first, so the
// home row can take `''` even if another page held it. `_pages_v` is left
// alone: restoring a version runs the same hooks.
//
// No other `slugField` collection is swept: their columns are NOT NULL, so a
// blank there cannot become NULL.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "pages" SET "slug" = NULL
      WHERE "slug" = '' AND "id" IS DISTINCT FROM (SELECT "home_page_id" FROM "wm_web_config" LIMIT 1);
    UPDATE "pages" SET "slug" = ''
      WHERE "slug" IS NULL AND "id" = (SELECT "home_page_id" FROM "wm_web_config" LIMIT 1);`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo: writing `''` back to more than one row would break the
  // unique index.
}
