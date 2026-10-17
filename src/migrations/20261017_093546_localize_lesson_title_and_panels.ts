import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Augmented: the generated DDL adds `lessons_panels._locale` as `NOT NULL` to a
 * populated table and drops `lessons.title` without reading it, so as issued it
 * aborts the boot migration and loses every Path Step title (#977). The
 * statements the generator cannot write are the two backfills below.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "lessons_panels" ADD COLUMN "_locale" "_locales";
  UPDATE "lessons_panels" SET "_locale" = 'en';
  ALTER TABLE "lessons_panels" ALTER COLUMN "_locale" SET NOT NULL;
  ALTER TABLE "lessons_locales" ADD COLUMN "title" varchar;
  INSERT INTO "lessons_locales" ("_locale", "_parent_id", "title")
    SELECT 'en', "lessons"."id", "lessons"."title" FROM "lessons"
    ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET "title" = EXCLUDED."title";
  CREATE INDEX "lessons_panels_locale_idx" ON "lessons_panels" USING btree ("_locale");
  ALTER TABLE "lessons" DROP COLUMN "title";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "lessons" ADD COLUMN "title" varchar;
  -- English where there is one, else any locale that has a title: the restored
  -- column is NOT NULL, so a step translated after the up still needs one.
  UPDATE "lessons" SET "title" = "fallback"."title"
    FROM (
      SELECT DISTINCT ON ("_parent_id") "_parent_id", "title"
      FROM "lessons_locales"
      WHERE "title" IS NOT NULL
      ORDER BY "_parent_id", ("_locale" = 'en') DESC
    ) AS "fallback"
    WHERE "fallback"."_parent_id" = "lessons"."id";
  UPDATE "lessons" SET "title" = '' WHERE "title" IS NULL;
  ALTER TABLE "lessons" ALTER COLUMN "title" SET NOT NULL;
  DELETE FROM "lessons_panels" WHERE "_locale" != 'en';
  DROP INDEX "lessons_panels_locale_idx";
  ALTER TABLE "lessons_panels" DROP COLUMN "_locale";
  ALTER TABLE "lessons_locales" DROP COLUMN "title";`)
}
