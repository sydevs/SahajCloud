import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- #987 deleted these three tasks, and the cast below rejects a slug the new
  -- enum lacks -- which aborts the boot migration rather than failing one row.
  -- deleteJobOnComplete is false and JOB_RETENTION_DAYS is 7, so finished rows
  -- naming them outlive this deploy by up to a week. Nothing reads them.
  DELETE FROM "payload_jobs_log" WHERE "task_slug" IN ('cleanupJobs', 'purgeSubmissions', 'sweepEventImports');
  DELETE FROM "payload_jobs" WHERE "task_slug" IN ('cleanupJobs', 'purgeSubmissions', 'sweepEventImports');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'cleanupCollections', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'cleanupCollections', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Mirrors the up: a rollback lands on a database whose rows name the slug
  -- this migration introduced, and the cast below has no label for it.
  DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'cleanupCollections';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'cleanupCollections';
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupJobs', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'sweepEventImports', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupJobs', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'sweepEventImports', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";`)
}
