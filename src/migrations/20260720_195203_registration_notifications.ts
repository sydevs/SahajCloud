import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'sendRegistrationDigests' BEFORE 'syncLectureMetadata';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'sendSessionReminders' BEFORE 'syncLectureMetadata';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'sendRegistrationDigests' BEFORE 'syncLectureMetadata';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'sendSessionReminders' BEFORE 'syncLectureMetadata';
  ALTER TABLE "managers" ADD COLUMN "last_registration_digest_sent_at" timestamp(3) with time zone;
  ALTER TABLE "registrations" ADD COLUMN "reminders_unsubscribed_at" timestamp(3) with time zone;
  ALTER TABLE "registrations" ADD COLUMN "reminder_log" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "managers" DROP COLUMN "last_registration_digest_sent_at";
  ALTER TABLE "registrations" DROP COLUMN "reminders_unsubscribed_at";
  ALTER TABLE "registrations" DROP COLUMN "reminder_log";`)
}
