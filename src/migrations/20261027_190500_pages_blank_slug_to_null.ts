import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Settles the blank slugs `pages` stored before `slugField` did (#1038,
// #1040): the configured home page holds `''`, and every other unpublished
// blank is NULL — Postgres admits one `''` under the unique index. A published
// page is never nulled: it is left as it is and named in the log, to be given a
// slug by hand. The home row takes `''` only when no other row holds it, and
// is named in the log when it cannot. `_pages_v` is left alone: a restore runs
// the same hooks.
//
// No other `slugField` collection is swept: their columns are NOT NULL, so a
// blank there cannot become NULL.

const HOME = sql`(SELECT "home_page_id" FROM "wm_web_config" LIMIT 1)`
const PUBLISHED = sql`EXISTS (SELECT 1 FROM "pages_locales" "l"
  WHERE "l"."_parent_id" = "pages"."id" AND "l"."_status" = 'published')`

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "pages" SET "slug" = NULL
      WHERE "slug" = '' AND "id" IS DISTINCT FROM ${HOME} AND NOT ${PUBLISHED};
    UPDATE "pages" SET "slug" = ''
      WHERE "slug" IS NULL AND "id" = ${HOME}
        AND NOT EXISTS (SELECT 1 FROM "pages" "other" WHERE "other"."slug" = '');`)

  const { rows } = await db.execute(sql`
    SELECT "id" FROM "pages" WHERE "slug" = '' AND "id" IS DISTINCT FROM ${HOME};`)
  if (rows.length > 0) {
    payload.logger.warn(
      { pages: rows.map(({ id }) => id) },
      "Published pages left holding the blank slug: give each a slug, so the home page can take ''.",
    )
  }
  const { rows: home } = await db.execute(sql`
    SELECT "id" FROM "pages" WHERE "slug" IS NULL AND "id" = ${HOME};`)
  if (home.length > 0) {
    payload.logger.warn(
      { page: home[0].id },
      "The home page is left with a NULL slug, which drops / from WeMeditateWeb's hreflang read.",
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo: writing `''` back to more than one row would break the
  // unique index.
}
