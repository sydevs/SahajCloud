import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A Path Step's intro recording becomes per language, and its subtitles become
 * the recording's own transcript (#1016): `lessons.intro_audio_id` moves into
 * `lessons_locales`, and `lessons.intro_subtitles` and `lessons_panels.subtitles`
 * go, their cues living in `transcripts` against the file.
 *
 * ⚠ **Three hand edits, all required, all approved for #1104.**
 *
 * - **The intro recording is copied into the `en` locale row** before its base
 *   column is dropped, which the generated delta does without reading it.
 *   Fallback is on (`src/collections/AGENTS.md`), so every other locale keeps
 *   reading what it reads today. `INSERT … ON CONFLICT DO UPDATE` rather than
 *   `UPDATE`, because a step created under another admin locale has no `en`
 *   row to update. `lessons` has no versions table to mirror.
 * - **The 28 hand-made English cue sets become their files' transcripts**,
 *   marked `imported`, before `intro_subtitles` is dropped: one transcript per
 *   file, from the first step using it, and none for a file that already has
 *   one (`source` is unique). Copied in SQL, so the cues arrive verbatim — the
 *   glossary hook rewrites only what a run writes. `lessons_panels.subtitles`
 *   holds no row in production, so it is dropped as generated.
 * - **The provider enum is rebuilt, not extended.** The generated
 *   `ADD VALUE 'imported'` cannot be used by that backfill in the same
 *   transaction (`unsafe use of new value`), and a migration runs in one
 *   (`src/migrations/AGENTS.md`, "Shrinking an enum").
 *
 * `transcripts.language` loses `NOT NULL` because a file's language is detected
 * by its first run, so its row starts without one.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "transcripts" ALTER COLUMN "provider" SET DATA TYPE text;
  DROP TYPE "public"."enum_transcripts_provider";
  CREATE TYPE "public"."enum_transcripts_provider" AS ENUM('lemonfox', 'imported');
  ALTER TABLE "transcripts" ALTER COLUMN "provider" SET DATA TYPE "public"."enum_transcripts_provider" USING "provider"::"public"."enum_transcripts_provider";
  ALTER TABLE "transcripts" ALTER COLUMN "language" DROP NOT NULL;
  ALTER TABLE "lessons" DROP CONSTRAINT "lessons_intro_audio_id_files_id_fk";

  DROP INDEX "lessons_intro_audio_idx";
  ALTER TABLE "lessons_locales" ADD COLUMN "intro_audio_id" integer;
  ALTER TABLE "lessons_locales" ADD CONSTRAINT "lessons_locales_intro_audio_id_files_id_fk" FOREIGN KEY ("intro_audio_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lessons_intro_audio_idx" ON "lessons_locales" USING btree ("intro_audio_id","_locale");`)

  // Backfill, while the base columns still exist. Not generated — see above.
  // Filenames are unique on "files", so the inserted transcripts are matched
  // back to their file by the name they were inserted with.
  await db.execute(sql`
   INSERT INTO "lessons_locales" ("_parent_id", "_locale", "intro_audio_id")
  SELECT l."id", 'en'::"public"."_locales", l."intro_audio_id"
    FROM "lessons" AS l
   WHERE l."intro_audio_id" IS NOT NULL
  ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET
    "intro_audio_id" = EXCLUDED."intro_audio_id";

  WITH sets AS (
    SELECT DISTINCT ON (l."intro_audio_id")
           l."intro_audio_id" AS file_id,
           l."intro_subtitles" AS segments
      FROM "lessons" AS l
     WHERE l."intro_audio_id" IS NOT NULL
       AND jsonb_typeof(l."intro_subtitles") = 'array'
       AND jsonb_array_length(l."intro_subtitles") > 0
       AND NOT EXISTS (
         SELECT 1 FROM "transcripts_rels" AS r
          WHERE r."files_id" = l."intro_audio_id" AND r."path" = 'source'
       )
     ORDER BY l."intro_audio_id", l."id"
  ),
  inserted AS (
    INSERT INTO "transcripts"
      ("audio_filename", "provider", "language", "segments", "segment_count", "updated_at", "created_at")
    SELECT f."filename",
           'imported'::"public"."enum_transcripts_provider",
           'en'::"public"."enum_transcripts_language",
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
  ALTER TABLE "lessons" DROP COLUMN "intro_audio_id";
  ALTER TABLE "lessons" DROP COLUMN "intro_subtitles";`)
}

/**
 * The mirror image, with its own backfill for the same reason: the restored
 * base columns come back empty. Each step gets back its `en` intro recording —
 * what the base column meant, since collapsing 19 locales to one loses the
 * rest by definition — and that file's transcript cues, whoever made them.
 * Then the `imported` transcripts go, and so do rows with no language, which a
 * `NOT NULL` column cannot hold: files still waiting on their first run. The
 * provider type is rebuilt only after its `imported` rows are gone.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lessons_panels" ADD COLUMN "subtitles" jsonb;
  ALTER TABLE "lessons" ADD COLUMN "intro_audio_id" integer;
  ALTER TABLE "lessons" ADD COLUMN "intro_subtitles" jsonb;`)

  // Backfill, while the locale column and the transcripts still exist. Not
  // generated — see above.
  await db.execute(sql`
   UPDATE "lessons" AS l
     SET "intro_audio_id" = loc."intro_audio_id"
    FROM "lessons_locales" AS loc
   WHERE loc."_parent_id" = l."id" AND loc."_locale" = 'en';

  UPDATE "lessons" AS l
     SET "intro_subtitles" = t."segments"
    FROM "transcripts_rels" AS r
    JOIN "transcripts" AS t ON t."id" = r."parent_id"
   WHERE r."path" = 'source'
     AND r."files_id" = l."intro_audio_id"
     AND t."segments" IS NOT NULL;

  DELETE FROM "transcripts" WHERE "provider" = 'imported' OR "language" IS NULL;`)

  await db.execute(sql`
   ALTER TABLE "lessons_locales" DROP CONSTRAINT "lessons_locales_intro_audio_id_files_id_fk";

  DROP INDEX "lessons_intro_audio_idx";
  ALTER TABLE "transcripts" ALTER COLUMN "provider" SET DATA TYPE text;
  DROP TYPE "public"."enum_transcripts_provider";
  CREATE TYPE "public"."enum_transcripts_provider" AS ENUM('lemonfox');
  ALTER TABLE "transcripts" ALTER COLUMN "provider" SET DATA TYPE "public"."enum_transcripts_provider" USING "provider"::"public"."enum_transcripts_provider";
  ALTER TABLE "transcripts" ALTER COLUMN "language" SET NOT NULL;
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_intro_audio_id_files_id_fk" FOREIGN KEY ("intro_audio_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lessons_intro_audio_idx" ON "lessons" USING btree ("intro_audio_id");
  ALTER TABLE "lessons_locales" DROP COLUMN "intro_audio_id";`)
}
