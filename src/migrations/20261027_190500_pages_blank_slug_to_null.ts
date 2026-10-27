import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no schema change. The `.json` beside this file is the previous
// migration's snapshot under this timestamp, which keeps the chain intact.
//
// `pages.slug` carries a unique index, and Postgres admits any number of NULLs
// under one but only a single `''`. `pages` autosaves, so the admin Create view
// saves an empty draft server-side before it redirects — and one row holding
// `''` refused every one of those (#1038). `slugField` now writes NULL for a
// blank title; this clears the rows written before it did.
//
// `_pages_v` is swept too, with no index to force it: restoring a version whose
// `version_slug` is `''` would write that value straight back onto the row and
// re-arm the collision.
//
// A page with no slug has no public path either way — `buildPageWebPath` reads
// `''` and NULL alike (`src/collections/Pages/webPath.ts`) — so nothing a
// reader can see changes here.
//
// The other `slugField` collections need no sweep: `authors`, `song_tags`,
// `user_choices` and `regions` all declare `slug` NOT NULL, so none can hold
// NULL, and none enables drafts — the one path that skips the field's own
// `required` validation and lets `''` land.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "pages" SET "slug" = NULL WHERE "slug" = '';
  UPDATE "_pages_v" SET "version_slug" = NULL WHERE "version_slug" = '';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo. `''` and NULL mean the same absent slug to every reader,
  // and writing `''` back to more than one row would break the unique index.
}
