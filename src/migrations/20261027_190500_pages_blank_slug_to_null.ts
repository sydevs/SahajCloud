import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Clears the blank slugs written before `slugField` started writing NULL for
// one on a collection with drafts (#1038, #1040 — `settleBlankSlug` says why
// `''` was fatal). `_pages_v` is swept alongside, with no index to force it:
// restoring a version whose `version_slug` is `''` would write that value back
// onto the row.
//
// A blank slug has no public path either way (`src/collections/Pages/webPath.ts`).
//
// No other `slugField` collection is swept. Their columns are NOT NULL, so a
// blank there cannot become NULL, and their source field's `required` kept one
// from being generated: drafts, which `pages` alone enables, are the one path
// that skips it.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "pages" SET "slug" = NULL WHERE "slug" = '';
  UPDATE "_pages_v" SET "version_slug" = NULL WHERE "version_slug" = '';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo. `''` and NULL mean the same absent slug to every reader,
  // and writing `''` back to more than one row would break the unique index.
}
