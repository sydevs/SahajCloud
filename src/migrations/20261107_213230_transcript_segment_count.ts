import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `status` is derived from how many cues a transcript holds. Reading that off
 * `segments` served the whole column to every caller who selected `status`, so
 * `segment_count` carries the same answer as a scalar.
 *
 * The backfill below is a hand edit to a generated migration, which this folder
 * otherwise refuses — the owner asked for it on PR #1087, because without it
 * every row written before this column reads `segment_count IS NULL`, which
 * derives as `failed`: the exact defect #1084 reported, on all 121 of
 * production's completed rows. The count is a pure projection of a column in
 * the same table, so no foreign key and no second table is involved.
 *
 * ⚠ **The table is named `transcripts` here, not `meditation_transcripts`.**
 * #1043's rename carries an earlier timestamp, so on a database that runs the
 * whole chain this statement arrives after it and the old name no longer
 * resolves. A database that already recorded this migration keeps whichever
 * name it ran under, so both orders hold.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "transcripts" ADD COLUMN "segment_count" numeric;`)

  await db.execute(sql`
   UPDATE "transcripts"
      SET "segment_count" = CASE
            WHEN jsonb_typeof("segments") = 'array' THEN jsonb_array_length("segments")
            ELSE 0
          END;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "transcripts" DROP COLUMN "segment_count";`)
}
