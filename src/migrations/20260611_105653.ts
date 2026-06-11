import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_events_verification_stage" AS ENUM('verified', 'reminded', 'escalated', 'expired', 'finished');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'expireEvents' BEFORE 'syncLectureMetadata';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'expireEvents' BEFORE 'syncLectureMetadata';
  ALTER TABLE "events" ADD COLUMN "inactive" boolean DEFAULT false;
  ALTER TABLE "events" ADD COLUMN "verification_stage" "enum_events_verification_stage" DEFAULT 'verified';
  ALTER TABLE "events" ADD COLUMN "next_check_at" timestamp(3) with time zone;
  ALTER TABLE "events" ADD COLUMN "notification_log" jsonb;
  ALTER TABLE "events" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "_events_v" ADD COLUMN "version_inactive" boolean DEFAULT false;
  ALTER TABLE "_events_v" ADD COLUMN "version_verification_stage" "enum_events_verification_stage" DEFAULT 'verified';
  ALTER TABLE "_events_v" ADD COLUMN "version_next_check_at" timestamp(3) with time zone;
  ALTER TABLE "_events_v" ADD COLUMN "version_notification_log" jsonb;
  ALTER TABLE "_events_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  CREATE INDEX "events_deleted_at_idx" ON "events" USING btree ("deleted_at");
  CREATE INDEX "_events_v_version_version_deleted_at_idx" ON "_events_v" USING btree ("version_deleted_at");
  ALTER TABLE "events" DROP COLUMN "status";
  ALTER TABLE "events" DROP COLUMN "verification_streak";
  ALTER TABLE "_events_v" DROP COLUMN "version_status";
  ALTER TABLE "_events_v" DROP COLUMN "version_verification_streak";
  DROP TYPE "public"."enum_events_activity_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_events_activity_status" AS ENUM('active', 'expired', 'inactive');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "events_deleted_at_idx";
  DROP INDEX "_events_v_version_version_deleted_at_idx";
  ALTER TABLE "events" ADD COLUMN "status" "enum_events_activity_status" DEFAULT 'active';
  ALTER TABLE "events" ADD COLUMN "verification_streak" numeric DEFAULT 0;
  ALTER TABLE "_events_v" ADD COLUMN "version_status" "enum_events_activity_status" DEFAULT 'active';
  ALTER TABLE "_events_v" ADD COLUMN "version_verification_streak" numeric DEFAULT 0;
  ALTER TABLE "events" DROP COLUMN "inactive";
  ALTER TABLE "events" DROP COLUMN "verification_stage";
  ALTER TABLE "events" DROP COLUMN "next_check_at";
  ALTER TABLE "events" DROP COLUMN "notification_log";
  ALTER TABLE "events" DROP COLUMN "deleted_at";
  ALTER TABLE "_events_v" DROP COLUMN "version_inactive";
  ALTER TABLE "_events_v" DROP COLUMN "version_verification_stage";
  ALTER TABLE "_events_v" DROP COLUMN "version_next_check_at";
  ALTER TABLE "_events_v" DROP COLUMN "version_notification_log";
  ALTER TABLE "_events_v" DROP COLUMN "version_deleted_at";
  DROP TYPE "public"."enum_events_verification_stage";`)
}
