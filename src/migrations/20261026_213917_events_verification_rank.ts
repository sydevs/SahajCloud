import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" ADD COLUMN "verification_rank" numeric;
  ALTER TABLE "_events_v" ADD COLUMN "version_verification_rank" numeric;
  CREATE INDEX "events_verification_rank_idx" ON "events" USING btree ("verification_rank");
  CREATE INDEX "_events_v_version_version_verification_rank_idx" ON "_events_v" USING btree ("version_verification_rank");`)
  // Backfill: `stageRank` as of this migration (`src/lib/eventVerification/stages.ts`).
  // Written out, not imported, so a later change to the ranks cannot rewrite history.
  await db.execute(sql`
   UPDATE "events" SET "verification_rank" = CASE "verification_stage"
     WHEN 'urgent' THEN 0
     WHEN 'verified' THEN 2
     WHEN 'finished' THEN 3
     ELSE 1 END;
  UPDATE "_events_v" SET "version_verification_rank" = CASE "version_verification_stage"
     WHEN 'urgent' THEN 0
     WHEN 'verified' THEN 2
     WHEN 'finished' THEN 3
     ELSE 1 END;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "events_verification_rank_idx";
  DROP INDEX "_events_v_version_version_verification_rank_idx";
  ALTER TABLE "events" DROP COLUMN "verification_rank";
  ALTER TABLE "_events_v" DROP COLUMN "version_verification_rank";`)
}
