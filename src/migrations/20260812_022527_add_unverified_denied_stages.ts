import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_events_verification_stage" ADD VALUE 'unverified' BEFORE 'verified';
  ALTER TYPE "public"."enum_events_verification_stage" ADD VALUE 'denied' BEFORE 'verified';
  ALTER TABLE "events" ADD COLUMN "submitter_id" integer;
  ALTER TABLE "events" ADD COLUMN "confidence_score" numeric;
  ALTER TABLE "events" ADD COLUMN "system_meta" jsonb;
  ALTER TABLE "_events_v" ADD COLUMN "version_submitter_id" integer;
  ALTER TABLE "_events_v" ADD COLUMN "version_confidence_score" numeric;
  ALTER TABLE "_events_v" ADD COLUMN "version_system_meta" jsonb;
  ALTER TABLE "events" ADD CONSTRAINT "events_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_submitter_id_users_id_fk" FOREIGN KEY ("version_submitter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "events_submitter_idx" ON "events" USING btree ("submitter_id");
  CREATE INDEX "events_confidence_score_idx" ON "events" USING btree ("confidence_score");
  CREATE INDEX "_events_v_version_version_submitter_idx" ON "_events_v" USING btree ("version_submitter_id");
  CREATE INDEX "_events_v_version_version_confidence_score_idx" ON "_events_v" USING btree ("version_confidence_score");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" DROP CONSTRAINT "events_submitter_id_users_id_fk";
  
  ALTER TABLE "_events_v" DROP CONSTRAINT "_events_v_version_submitter_id_users_id_fk";
  
  ALTER TABLE "events" ALTER COLUMN "verification_stage" SET DATA TYPE text;
  ALTER TABLE "events" ALTER COLUMN "verification_stage" SET DEFAULT 'verified'::text;
  ALTER TABLE "_events_v" ALTER COLUMN "version_verification_stage" SET DATA TYPE text;
  ALTER TABLE "_events_v" ALTER COLUMN "version_verification_stage" SET DEFAULT 'verified'::text;
  DROP TYPE "public"."enum_events_verification_stage";
  CREATE TYPE "public"."enum_events_verification_stage" AS ENUM('verified', 'reminded', 'escalated', 'urgent', 'expired', 'finished');
  ALTER TABLE "events" ALTER COLUMN "verification_stage" SET DEFAULT 'verified'::"public"."enum_events_verification_stage";
  ALTER TABLE "events" ALTER COLUMN "verification_stage" SET DATA TYPE "public"."enum_events_verification_stage" USING "verification_stage"::"public"."enum_events_verification_stage";
  ALTER TABLE "_events_v" ALTER COLUMN "version_verification_stage" SET DEFAULT 'verified'::"public"."enum_events_verification_stage";
  ALTER TABLE "_events_v" ALTER COLUMN "version_verification_stage" SET DATA TYPE "public"."enum_events_verification_stage" USING "version_verification_stage"::"public"."enum_events_verification_stage";
  DROP INDEX "events_submitter_idx";
  DROP INDEX "events_confidence_score_idx";
  DROP INDEX "_events_v_version_version_submitter_idx";
  DROP INDEX "_events_v_version_version_confidence_score_idx";
  ALTER TABLE "events" DROP COLUMN "submitter_id";
  ALTER TABLE "events" DROP COLUMN "confidence_score";
  ALTER TABLE "events" DROP COLUMN "system_meta";
  ALTER TABLE "_events_v" DROP COLUMN "version_submitter_id";
  ALTER TABLE "_events_v" DROP COLUMN "version_confidence_score";
  ALTER TABLE "_events_v" DROP COLUMN "version_system_meta";`)
}
