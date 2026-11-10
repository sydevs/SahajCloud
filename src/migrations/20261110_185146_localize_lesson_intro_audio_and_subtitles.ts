import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Move a Path Step's intro recording and its subtitle cues into
 * `lessons_locales`, so each of the 19 languages carries its own (#1016).
 *
 * ⚠ **The backfill between the DDL blocks is hand-written, and this migration
 * is wrong without it.** Drizzle's generated delta adds the two locale columns
 * and then drops the base ones without reading them, so all 28 recordings and
 * all 28 cue sets would go empty. The precedent is
 * `20261020_170450_localize_admin_edited_fields.ts` — the same FK-plus-`jsonb`
 * case.
 *
 * Each value is copied into the **`en`** row alone. Fallback is on
 * (`src/collections/AGENTS.md`), so every other locale keeps reading exactly
 * what it reads today, and an editor narrows it per locale from there — which
 * is the point of the flag.
 *
 * `INSERT … ON CONFLICT DO UPDATE` rather than a plain `UPDATE`: a step created
 * under a non-English admin locale has no `en` row to update, and an `UPDATE`
 * would silently skip it. Every other column of `lessons_locales` is nullable,
 * so an inserted row needs no borrowed value.
 *
 * `lessons` carries no drafts or versions (`Lessons.ts`), so there is no
 * `_lessons_v*` companion to mirror — unlike the app-cards precedents.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lessons" DROP CONSTRAINT "lessons_intro_audio_id_files_id_fk";

  DROP INDEX "lessons_intro_audio_idx";
  ALTER TABLE "lessons_locales" ADD COLUMN "intro_audio_id" integer;
  ALTER TABLE "lessons_locales" ADD COLUMN "intro_subtitles" jsonb;
  ALTER TABLE "lessons_locales" ADD CONSTRAINT "lessons_locales_intro_audio_id_files_id_fk" FOREIGN KEY ("intro_audio_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lessons_intro_audio_idx" ON "lessons_locales" USING btree ("intro_audio_id","_locale");`)

  // Backfill, while the base columns still exist. Not generated — see above.
  await db.execute(sql`
   INSERT INTO "lessons_locales" ("_parent_id", "_locale", "intro_audio_id", "intro_subtitles")
  SELECT l."id", 'en', l."intro_audio_id", l."intro_subtitles"
    FROM "lessons" AS l
   WHERE l."intro_audio_id" IS NOT NULL
      OR l."intro_subtitles" IS NOT NULL
  ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET
    "intro_audio_id" = EXCLUDED."intro_audio_id",
    "intro_subtitles" = EXCLUDED."intro_subtitles";`)

  await db.execute(sql`
   ALTER TABLE "lessons" DROP COLUMN "intro_audio_id";
  ALTER TABLE "lessons" DROP COLUMN "intro_subtitles";`)
}

/**
 * The mirror image, and it needs its own backfill for the same reason: the
 * restored base columns come back empty, so a rolled-back deploy would drop
 * every value the up migration just took care to keep.
 *
 * Collapsing 19 locales back to one loses information by definition. The `en`
 * value is what the base column meant, so that is what is restored.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lessons_locales" DROP CONSTRAINT "lessons_locales_intro_audio_id_files_id_fk";

  DROP INDEX "lessons_intro_audio_idx";
  ALTER TABLE "lessons" ADD COLUMN "intro_audio_id" integer;
  ALTER TABLE "lessons" ADD COLUMN "intro_subtitles" jsonb;`)

  // Backfill, while the locale columns still exist. Not generated — see above.
  await db.execute(sql`
   UPDATE "lessons" AS l SET
    "intro_audio_id" = loc."intro_audio_id",
    "intro_subtitles" = loc."intro_subtitles"
    FROM "lessons_locales" AS loc
   WHERE loc."_parent_id" = l."id" AND loc."_locale" = 'en';`)

  await db.execute(sql`
   ALTER TABLE "lessons" ADD CONSTRAINT "lessons_intro_audio_id_files_id_fk" FOREIGN KEY ("intro_audio_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lessons_intro_audio_idx" ON "lessons" USING btree ("intro_audio_id");
  ALTER TABLE "lessons_locales" DROP COLUMN "intro_audio_id";
  ALTER TABLE "lessons_locales" DROP COLUMN "intro_subtitles";`)
}
