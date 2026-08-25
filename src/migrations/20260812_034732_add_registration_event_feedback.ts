import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_registrations_event_feedback" AS ENUM('confirmed', 'denied');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'sendPostEventFollowUps' BEFORE 'sendRegistrationDigests';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'sendPostEventFollowUps' BEFORE 'sendRegistrationDigests';
  ALTER TABLE "registrations" ADD COLUMN "event_feedback" "enum_registrations_event_feedback";
  ALTER TABLE "registrations" ADD COLUMN "event_feedback_at" timestamp(3) with time zone;
  ALTER TABLE "registrations" ADD COLUMN "follow_up_sent_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'screenEventSubmission', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'screenEventSubmission', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "registrations" DROP COLUMN "event_feedback";
  ALTER TABLE "registrations" DROP COLUMN "event_feedback_at";
  ALTER TABLE "registrations" DROP COLUMN "follow_up_sent_at";
  DROP TYPE "public"."enum_registrations_event_feedback";`)
}
