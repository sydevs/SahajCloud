import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'commitEventImport' BEFORE 'deliverSubmission';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'resolveEventImport' BEFORE 'screenSubmission';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'sweepEventImports' BEFORE 'syncLectureMetadata';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'commitEventImport' BEFORE 'deliverSubmission';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'resolveEventImport' BEFORE 'screenSubmission';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'sweepEventImports' BEFORE 'syncLectureMetadata';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";`)
}
