import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds the `analyzeEventImport` task slug to both job-slug enums, for the
 * rename of `resolveEventImport` (#960 part 5).
 *
 * ⚠ **Trimmed by hand, and the snapshot beside it is not.** `migrate:create`
 * diffs against the newest-by-timestamp `.json`, which after merging `main`
 * belongs to a migration that predates this branch — so the run re-emitted
 * every statement `20261010_013059_event_imports` and
 * `20261010_025807_event_import_jobs` already ship (the documented
 * out-of-order snapshot trap, `src/migrations/AGENTS.md`). Replaying
 * `CREATE TABLE "event_imports"` would abort the boot migration on this PR's
 * Railway preview, where both have applied. The `.json` was generated on the
 * merged tree and is what heals the chain, so it is kept as generated.
 *
 * ⚠ **`resolveEventImport` stays in both enums.** Postgres cannot drop an enum
 * value, and a `payload_jobs` row queued before this deploy still names it.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'analyzeEventImport' BEFORE 'cleanupOrphanedMedia';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'analyzeEventImport' BEFORE 'cleanupOrphanedMedia';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'commitEventImport', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'resolveEventImport', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'sweepEventImports', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'commitEventImport', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'resolveEventImport', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'sweepEventImports', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";`)
}
