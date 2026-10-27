import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Clears the blank slugs written before `slugField` started answering NULL for
// one (#1038 — see that override for why `''` was fatal). `_pages_v` is swept
// alongside, with no index to force it: restoring a version whose
// `version_slug` is `''` would write that value back onto the row.
//
// A blank slug has no public path either way (`src/collections/Pages/webPath.ts`).
//
// No other `slugField` collection needs this: `authors`, `song_tags`,
// `user_choices` and `regions` are all NOT NULL and none enables drafts — the
// one path that skips the field's own `required` validation and lets `''` land.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "pages" SET "slug" = NULL WHERE "slug" = '';
  UPDATE "_pages_v" SET "version_slug" = NULL WHERE "version_slug" = '';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo. `''` and NULL mean the same absent slug to every reader,
  // and writing `''` back to more than one row would break the unique index.
}
