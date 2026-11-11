import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A Path Step's intro subtitles stop being a column on the step and become its
 * intro file's transcript (#1016): `lessons_locales.intro_subtitles` and
 * `lessons_panels.subtitles` go, and a file's cues live in `transcripts`.
 *
 * ⚠ **Two hand edits, both required, both approved on the PR.**
 *
 * - **The backfill.** Drizzle's delta drops `intro_subtitles` without reading
 *   it, which would empty all 28 hand-made English cue sets. They are copied
 *   first into one transcript per intro file, marked `imported`, in the
 *   language of the locale row that held them. A file used by several steps or
 *   locales gets one transcript, preferring the English set; a file that
 *   already has a transcript keeps it (`source` is unique). Copied in SQL, so
 *   the cues arrive verbatim — the glossary hook rewrites only what a run
 *   writes. `lessons_panels.subtitles` holds no row in production, so it is
 *   dropped as generated.
 * - **The provider enum is rebuilt, not extended.** The generated
 *   `ADD VALUE 'imported'` cannot be used by the backfill in the same
 *   transaction (`unsafe use of new value`), and a migration runs in one — so
 *   the type is recreated with the value, which Postgres lets the same
 *   transaction use (`src/migrations/AGENTS.md`, "Shrinking an enum").
 *
 * `language` loses `NOT NULL` because a file's language is detected by its
 * first run, so its row starts without one.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "transcripts" ALTER COLUMN "provider" SET DATA TYPE text;
  DROP TYPE "public"."enum_transcripts_provider";
  CREATE TYPE "public"."enum_transcripts_provider" AS ENUM('lemonfox', 'imported');
  ALTER TABLE "transcripts" ALTER COLUMN "provider" SET DATA TYPE "public"."enum_transcripts_provider" USING "provider"::"public"."enum_transcripts_provider";
  ALTER TABLE "transcripts" ALTER COLUMN "language" DROP NOT NULL;`)
  // Backfill, while the column still exists. Not generated — see above.
  // Filenames are unique on "files", so the inserted rows are matched back to
  // their file by the name they were inserted with.
  await db.execute(sql`
   WITH sets AS (
    SELECT DISTINCT ON (loc."intro_audio_id")
           loc."intro_audio_id" AS file_id,
           loc."_locale"::text AS language,
           loc."intro_subtitles" AS segments
      FROM "lessons_locales" AS loc
     WHERE loc."intro_audio_id" IS NOT NULL
       AND jsonb_typeof(loc."intro_subtitles") = 'array'
       AND jsonb_array_length(loc."intro_subtitles") > 0
       AND NOT EXISTS (
         SELECT 1 FROM "transcripts_rels" AS r
          WHERE r."files_id" = loc."intro_audio_id" AND r."path" = 'source'
       )
     ORDER BY loc."intro_audio_id", (loc."_locale" = 'en') DESC, loc."_parent_id"
  ),
  inserted AS (
    INSERT INTO "transcripts"
      ("audio_filename", "provider", "language", "segments", "segment_count", "updated_at", "created_at")
    SELECT f."filename",
           'imported',
           sets.language::"public"."enum_transcripts_language",
           sets.segments,
           jsonb_array_length(sets.segments),
           now(),
           now()
      FROM sets
      JOIN "files" AS f ON f."id" = sets.file_id
    RETURNING "id", "audio_filename"
  )
  INSERT INTO "transcripts_rels" ("order", "parent_id", "path", "files_id")
  SELECT NULL, inserted."id", 'source', f."id"
    FROM inserted
    JOIN "files" AS f ON f."filename" = inserted."audio_filename";`)
  await db.execute(sql`
   ALTER TABLE "lessons_panels" DROP COLUMN "subtitles";
  ALTER TABLE "lessons_locales" DROP COLUMN "intro_subtitles";`)
}

/**
 * The mirror image. Each locale row gets back the cues of its intro file's
 * transcript, whoever made them, before the imported rows go. Rows with no
 * language are removed too, since the column regains `NOT NULL`: they are
 * files still waiting on their first run, which a rolled-back schema cannot
 * describe. The provider type is rebuilt after its `imported` rows are gone,
 * for the reason the up migration rebuilds it.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lessons_panels" ADD COLUMN "subtitles" jsonb;
  ALTER TABLE "lessons_locales" ADD COLUMN "intro_subtitles" jsonb;`)
  // Backfill, while the transcripts still exist. Not generated — see above.
  await db.execute(sql`
   UPDATE "lessons_locales" AS loc
     SET "intro_subtitles" = t."segments"
    FROM "transcripts_rels" AS r
    JOIN "transcripts" AS t ON t."id" = r."parent_id"
   WHERE r."path" = 'source'
     AND r."files_id" = loc."intro_audio_id"
     AND t."segments" IS NOT NULL;
  DELETE FROM "transcripts" WHERE "provider" = 'imported' OR "language" IS NULL;`)
  await db.execute(sql`
   ALTER TABLE "transcripts" ALTER COLUMN "provider" SET DATA TYPE text;
  DROP TYPE "public"."enum_transcripts_provider";
  CREATE TYPE "public"."enum_transcripts_provider" AS ENUM('lemonfox');
  ALTER TABLE "transcripts" ALTER COLUMN "provider" SET DATA TYPE "public"."enum_transcripts_provider" USING "provider"::"public"."enum_transcripts_provider";
  ALTER TABLE "transcripts" ALTER COLUMN "language" SET NOT NULL;`)
}
