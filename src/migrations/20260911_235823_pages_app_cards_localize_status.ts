import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Move `_status` / `version__status` for `pages` and `app-cards` into their
 * `_locales` tables, so publish state is per locale (#718).
 *
 * ⚠ **The backfill between the two DDL blocks is hand-written, and the
 * migration is wrong without it.** Drizzle's generated delta adds the locale
 * column with `DEFAULT 'draft'` and then drops the base column — so every
 * already-published page lands `draft` in all 19 locales, and `pages` is read
 * published-only by `wemeditate-web-client`. Shipped as generated, the deploy
 * unpublishes the entire We Meditate site until an editor re-publishes each
 * page by hand. #731 accepted that outcome for the translations globals, where
 * the blast radius was one config gate. It is not acceptable here.
 *
 * The backfill copies the base column's value to **every** locale, which
 * preserves exactly what is observable today: a published page renders in all
 * 19 locales today, through Payload's English fallback. Per-locale truth does
 * not exist in the old schema to recover — `_pages_v.published_locale` records
 * publish *events*, and it is NULL for every row written before this flag,
 * which Payload itself reads as "published in all locales"
 * (`payload/dist/versions/migrations/localizeStatus/shared.js`).
 *
 * Editors narrow it from there, per locale, which is the point of the flag.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "pages__status_idx";
  DROP INDEX "_pages_v_version_version__status_idx";
  DROP INDEX "app_cards__status_idx";
  DROP INDEX "_app_cards_v_version_version__status_idx";
  ALTER TABLE "pages_locales" ADD COLUMN "_status" "enum_pages_status" DEFAULT 'draft';
  ALTER TABLE "_pages_v_locales" ADD COLUMN "version__status" "enum__pages_v_version_status" DEFAULT 'draft';
  ALTER TABLE "app_cards_locales" ADD COLUMN "_status" "enum_app_cards_status" DEFAULT 'draft';
  ALTER TABLE "_app_cards_v_locales" ADD COLUMN "version__status" "enum__app_cards_v_version_status" DEFAULT 'draft';`)

  // Backfill, while the base column still exists. Not generated — see above.
  await db.execute(sql`
   UPDATE "pages_locales" AS l SET "_status" = p."_status"
    FROM "pages" AS p WHERE l."_parent_id" = p."id" AND p."_status" IS NOT NULL;
  UPDATE "_pages_v_locales" AS l SET "version__status" = v."version__status"
    FROM "_pages_v" AS v WHERE l."_parent_id" = v."id" AND v."version__status" IS NOT NULL;
  UPDATE "app_cards_locales" AS l SET "_status" = c."_status"
    FROM "app_cards" AS c WHERE l."_parent_id" = c."id" AND c."_status" IS NOT NULL;
  UPDATE "_app_cards_v_locales" AS l SET "version__status" = v."version__status"
    FROM "_app_cards_v" AS v WHERE l."_parent_id" = v."id" AND v."version__status" IS NOT NULL;`)

  await db.execute(sql`
   CREATE INDEX "pages__status_idx" ON "pages_locales" USING btree ("_status","_locale");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v_locales" USING btree ("version__status","_locale");
  CREATE INDEX "app_cards__status_idx" ON "app_cards_locales" USING btree ("_status","_locale");
  CREATE INDEX "_app_cards_v_version_version__status_idx" ON "_app_cards_v_locales" USING btree ("version__status","_locale");
  ALTER TABLE "pages" DROP COLUMN "_status";
  ALTER TABLE "_pages_v" DROP COLUMN "version__status";
  ALTER TABLE "app_cards" DROP COLUMN "_status";
  ALTER TABLE "_app_cards_v" DROP COLUMN "version__status";`)
}

/**
 * The mirror image, and it needs its own backfill for the same reason: the
 * restored base column defaults to `draft`, so a rolled-back deploy would
 * unpublish everything that `up()` just took care to keep published.
 *
 * Collapsing 19 locales back to one value loses information by definition.
 * `published` in **any** locale restores `published` on the base column, which
 * is the reading that matches the old schema's semantics — the base column
 * meant "this document is live", and it was live wherever any locale was.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "pages__status_idx";
  DROP INDEX "_pages_v_version_version__status_idx";
  DROP INDEX "app_cards__status_idx";
  DROP INDEX "_app_cards_v_version_version__status_idx";
  ALTER TABLE "pages" ADD COLUMN "_status" "enum_pages_status" DEFAULT 'draft';
  ALTER TABLE "_pages_v" ADD COLUMN "version__status" "enum__pages_v_version_status" DEFAULT 'draft';
  ALTER TABLE "app_cards" ADD COLUMN "_status" "enum_app_cards_status" DEFAULT 'draft';
  ALTER TABLE "_app_cards_v" ADD COLUMN "version__status" "enum__app_cards_v_version_status" DEFAULT 'draft';`)

  // Backfill, while the locale column still exists. Not generated — see above.
  await db.execute(sql`
   UPDATE "pages" AS p SET "_status" = 'published' WHERE EXISTS (
    SELECT 1 FROM "pages_locales" AS l WHERE l."_parent_id" = p."id" AND l."_status" = 'published');
  UPDATE "_pages_v" AS v SET "version__status" = 'published' WHERE EXISTS (
    SELECT 1 FROM "_pages_v_locales" AS l WHERE l."_parent_id" = v."id" AND l."version__status" = 'published');
  UPDATE "app_cards" AS c SET "_status" = 'published' WHERE EXISTS (
    SELECT 1 FROM "app_cards_locales" AS l WHERE l."_parent_id" = c."id" AND l."_status" = 'published');
  UPDATE "_app_cards_v" AS v SET "version__status" = 'published' WHERE EXISTS (
    SELECT 1 FROM "_app_cards_v_locales" AS l WHERE l."_parent_id" = v."id" AND l."version__status" = 'published');`)

  await db.execute(sql`
   CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "app_cards__status_idx" ON "app_cards" USING btree ("_status");
  CREATE INDEX "_app_cards_v_version_version__status_idx" ON "_app_cards_v" USING btree ("version__status");
  ALTER TABLE "pages_locales" DROP COLUMN "_status";
  ALTER TABLE "_pages_v_locales" DROP COLUMN "version__status";
  ALTER TABLE "app_cards_locales" DROP COLUMN "_status";
  ALTER TABLE "_app_cards_v_locales" DROP COLUMN "version__status";`)
}
