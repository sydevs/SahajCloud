import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Names the live-meditations reminder page in its new `wm-app-config` slot. The
// app recognises that page by its slug alone today, so the slug is the one
// source to read it from; a configuration that already names a page, or a
// database with no such page, is left alone. Naming it also places the page in
// the app, so a restricted app key still reads it (#783).

const SLUG = 'live-meditations-reminder'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "wm_app_config" SET "live_meditations_reminder_page_id" = (
      SELECT "id" FROM "pages" WHERE "slug" = ${SLUG} AND "deleted_at" IS NULL ORDER BY "id" LIMIT 1
    )
    WHERE "live_meditations_reminder_page_id" IS NULL`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "wm_app_config" SET "live_meditations_reminder_page_id" = NULL
    WHERE "live_meditations_reminder_page_id" IN (SELECT "id" FROM "pages" WHERE "slug" = ${SLUG})`)
}
