import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A recording's language moves onto the recording (#1016): a file states its
 * own as `files.spoken_language`, and `transcripts.language` goes — a
 * meditation's was always a copy of its own `locale`.
 *
 * ⚠ **One hand edit each way, both approved for #1104.**
 *
 * - **up copies a file's language off its transcript** before the column is
 *   dropped, which the generated delta does without reading it. The two enums
 *   carry the same locale codes, so the cast through text cannot fail.
 * - **down puts it back** from the file, or from the meditation's own locale,
 *   so the previous migration's down finds a language on every row it keeps.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_files_spoken_language" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  ALTER TABLE "files" ADD COLUMN "spoken_language" "enum_files_spoken_language";`)

  // Backfill, while the transcript column still exists. Not generated — see above.
  await db.execute(sql`
   UPDATE "files" AS f
     SET "spoken_language" = t."language"::text::"public"."enum_files_spoken_language"
    FROM "transcripts" AS t
    JOIN "transcripts_rels" AS r ON r."parent_id" = t."id" AND r."path" = 'source'
   WHERE r."files_id" = f."id"
     AND t."language" IS NOT NULL;`)

  await db.execute(sql`
   ALTER TABLE "transcripts" DROP COLUMN "language";
  DROP TYPE "public"."enum_transcripts_language";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_transcripts_language" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  ALTER TABLE "transcripts" ADD COLUMN "language" "enum_transcripts_language";`)

  // Backfill, while the file column still exists. Not generated — see above.
  await db.execute(sql`
   UPDATE "transcripts" AS t
     SET "language" = COALESCE(f."spoken_language"::text, m."locale"::text)::"public"."enum_transcripts_language"
    FROM "transcripts_rels" AS r
    LEFT JOIN "files" AS f ON f."id" = r."files_id"
    LEFT JOIN "meditations" AS m ON m."id" = r."meditations_id"
   WHERE r."parent_id" = t."id"
     AND r."path" = 'source';`)

  await db.execute(sql`
   ALTER TABLE "files" DROP COLUMN "spoken_language";
  DROP TYPE "public"."enum_files_spoken_language";`)
}
