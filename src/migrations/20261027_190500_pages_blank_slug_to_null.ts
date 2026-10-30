import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Clears the blank slugs `pages` stored before `slugField` wrote NULL for one
// (#1038, #1040 — `blankSlugHooks` says why `''` was fatal). `_pages_v` is swept
// too, so its history holds no `''` either.
//
// A blank slug has no public path either way (`src/collections/Pages/webPath.ts`).
//
// No other `slugField` collection is swept: their columns are NOT NULL, so a
// blank there cannot become NULL. `slugField` lets a stored blank re-save
// unchanged and refuses a new one.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "pages" SET "slug" = NULL WHERE "slug" = '';
    UPDATE "_pages_v" SET "version_slug" = NULL WHERE "version_slug" = '';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo. `''` and NULL mean the same absent slug to every reader,
  // and writing `''` back to more than one row would break the unique index.
}
