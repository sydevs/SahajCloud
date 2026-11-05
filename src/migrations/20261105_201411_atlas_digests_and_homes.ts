import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Hand-edited, in four places. Each one is a statement the generator cannot
 * know to write, and three of them are the difference between a deploy and a
 * boot crash-loop.
 *
 * 1. **Jobs of a deleted task slug go before the enum rebuild.** `up` drops
 *    `sendRegistrationDigests` from both `task_slug` enums, and the rebuild's
 *    final `USING "task_slug"::<enum>` throws
 *    `invalid input value for enum` on any surviving row — which aborts the
 *    boot migration. The rows are deleted while the column is still the enum,
 *    so the literal is still a valid member to compare against
 *    (`src/migrations/AGENTS.md`). `down` owes the same for the two slugs this
 *    migration adds.
 * 2. **`confirmed_spam` rows are released before `down` shrinks the status
 *    enum**, for the same reason: `down` rebuilds the type without the value,
 *    and a row still carrying it fails the cast. They go back to `spam`, which
 *    is what they were before an admin agreed.
 * 3. **Preferences are rewritten, not just re-defaulted.** The column DEFAULT
 *    above reaches new rows only, so every existing manager keeps whatever
 *    they chose — and two of those choices no longer exist. 'Daily Summary'
 *    becomes 'Daily' and 'Weekly Summary' becomes 'Weekly', so a manager on a
 *    summary cadence stays on it; `regional_summary` is dropped, because
 *    #1070 replaced it with two rows Atlas never asked about, and
 *    `notificationFrequency` resolves both from their own defaults. The
 *    precedent is `20260928_051738_add_manager_invitation_queue.ts`.
 * 4. **`down` puts all three back**, so the chain round-trips — and drops the
 *    two `DROP CONSTRAINT` statements the generator emits for FKs the
 *    `DROP TABLE … CASCADE` above has already taken. It emits those for every
 *    new collection with a locked-documents relationship.
 */

/** The task slugs `up` removes, whose job rows cannot survive the rebuild. */
const REMOVED_SLUGS = sql`('sendRegistrationDigests')`

/** The task slugs `up` adds, whose job rows cannot survive `down`'s rebuild. */
const ADDED_SLUGS = sql`('sendDigests', 'recordAtlasSnapshot')`

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Before the rebuild below: a `payload_jobs` row naming a slug the new enum
  // does not hold fails the cast and aborts the boot migration.
  await db.execute(sql`
  DELETE FROM "payload_jobs_log" WHERE "task_slug" IN ${REMOVED_SLUGS};
  DELETE FROM "payload_jobs" WHERE "task_slug" IN ${REMOVED_SLUGS};`)

  await db.execute(sql`
   CREATE TYPE "public"."enum_registration_refusals_stage" AS ENUM('request', 'screening');
  ALTER TYPE "public"."enum_user_submissions_status" ADD VALUE 'confirmed_spam' BEFORE 'failed';
  CREATE TABLE "atlas_snapshots" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"date" varchar NOT NULL,
  	"counts" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "registration_refusals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" integer,
  	"stage" "enum_registration_refusals_stage" NOT NULL,
  	"reason" varchar NOT NULL,
  	"hour" timestamp(3) with time zone,
  	"count" numeric DEFAULT 1 NOT NULL,
  	"submission_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'recordAtlasSnapshot', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'screenSubmission', 'sendPostEventFollowUps', 'sendDigests', 'sendSessionReminders', 'cleanupCollections', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'recordAtlasSnapshot', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'screenSubmission', 'sendPostEventFollowUps', 'sendDigests', 'sendSessionReminders', 'cleanupCollections', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "managers" ALTER COLUMN "notification_preferences" SET DEFAULT '{"invitation":{"frequency":"Immediate","method":"email"},"event_verification":{"frequency":"Monthly","method":"email"},"event_registration":{"frequency":"Daily","method":"email"},"new_proposals":{"frequency":"Daily","method":"email"},"open_items":{"frequency":"Monthly","method":"email"},"refused_signups":{"frequency":"Daily","method":"email"},"statistics":{"frequency":"Monthly","method":"email"}}'::jsonb;
  ALTER TABLE "managers" ADD COLUMN "digest_watermarks" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "atlas_snapshots_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "registration_refusals_id" integer;
  ALTER TABLE "registration_refusals" ADD CONSTRAINT "registration_refusals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "registration_refusals" ADD CONSTRAINT "registration_refusals_submission_id_user_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."user_submissions"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "atlas_snapshots_date_idx" ON "atlas_snapshots" USING btree ("date");
  CREATE INDEX "atlas_snapshots_updated_at_idx" ON "atlas_snapshots" USING btree ("updated_at");
  CREATE INDEX "atlas_snapshots_created_at_idx" ON "atlas_snapshots" USING btree ("created_at");
  CREATE INDEX "registration_refusals_event_idx" ON "registration_refusals" USING btree ("event_id");
  CREATE INDEX "registration_refusals_submission_idx" ON "registration_refusals" USING btree ("submission_id");
  CREATE INDEX "registration_refusals_updated_at_idx" ON "registration_refusals" USING btree ("updated_at");
  CREATE INDEX "registration_refusals_created_at_idx" ON "registration_refusals" USING btree ("created_at");
  CREATE UNIQUE INDEX "event_reason_hour_idx" ON "registration_refusals" USING btree ("event_id","reason","hour");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_atlas_snapshots_fk" FOREIGN KEY ("atlas_snapshots_id") REFERENCES "public"."atlas_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_registration_refusals_fk" FOREIGN KEY ("registration_refusals_id") REFERENCES "public"."registration_refusals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_atlas_snapshots_id_idx" ON "payload_locked_documents_rels" USING btree ("atlas_snapshots_id");
  CREATE INDEX "payload_locked_documents_rels_registration_refusals_id_idx" ON "payload_locked_documents_rels" USING btree ("registration_refusals_id");
  ALTER TABLE "managers" DROP COLUMN "last_registration_digest_sent_at";`)

  // The DEFAULT above reaches new rows only, so every existing manager keeps
  // the cadence they chose — and two of those spellings are gone. Renaming the
  // value rather than clearing the key is what keeps a manager on 'Weekly
  // Summary' on 'Weekly' instead of silently back on the default.
  await db.execute(sql`
  UPDATE "managers"
  SET "notification_preferences" = jsonb_strip_nulls(
    ("notification_preferences" - 'regional_summary')
    || jsonb_build_object(
      'event_registration',
      CASE "notification_preferences" -> 'event_registration' ->> 'frequency'
        WHEN 'Daily Summary' THEN
          ("notification_preferences" -> 'event_registration')
            || jsonb_build_object('frequency', 'Daily')
        WHEN 'Weekly Summary' THEN
          ("notification_preferences" -> 'event_registration')
            || jsonb_build_object('frequency', 'Weekly')
        ELSE "notification_preferences" -> 'event_registration'
      END
    )
  )
  WHERE "notification_preferences" IS NOT NULL
    AND jsonb_typeof("notification_preferences") = 'object';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Both before the rebuilds below, and for the same reason: the enum this
  // migration widened is about to be recreated without its new values, and the
  // cast at the end of each rebuild fails on a row that still holds one.
  // `confirmed_spam` goes back to `spam`, which is what it was before an admin
  // agreed with the spam check.
  await db.execute(sql`
  UPDATE "user_submissions" SET "status" = 'spam' WHERE "status" = 'confirmed_spam';
  DELETE FROM "payload_jobs_log" WHERE "task_slug" IN ${ADDED_SLUGS};
  DELETE FROM "payload_jobs" WHERE "task_slug" IN ${ADDED_SLUGS};`)

  await db.execute(sql`
   ALTER TABLE "atlas_snapshots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "registration_refusals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "atlas_snapshots" CASCADE;
  DROP TABLE "registration_refusals" CASCADE;
  -- No DROP CONSTRAINT for the two payload_locked_documents_rels FKs: CASCADE
  -- above takes each with the table it references, so dropping it again aborts
  -- the boot migration. migrate:create emits both statements anyway — the same
  -- edit 20261019_182311_import_plugin.ts carries, measured here against a
  -- throwaway database.
  ALTER TABLE "user_submissions" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "user_submissions" ALTER COLUMN "status" SET DEFAULT 'pending'::text;
  DROP TYPE "public"."enum_user_submissions_status";
  CREATE TYPE "public"."enum_user_submissions_status" AS ENUM('pending', 'accepted', 'rejected', 'spam', 'failed');
  ALTER TABLE "user_submissions" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."enum_user_submissions_status";
  ALTER TABLE "user_submissions" ALTER COLUMN "status" SET DATA TYPE "public"."enum_user_submissions_status" USING "status"::"public"."enum_user_submissions_status";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'cleanupCollections', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'cleanupCollections', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_atlas_snapshots_id_idx";
  DROP INDEX "payload_locked_documents_rels_registration_refusals_id_idx";
  ALTER TABLE "managers" ALTER COLUMN "notification_preferences" SET DEFAULT '{"invitation":{"frequency":"Immediate","method":"email"},"event_verification":{"frequency":"Monthly","method":"email"},"event_registration":{"frequency":"Immediate","method":"email"},"regional_summary":{"frequency":"Monthly","method":"email"}}'::jsonb;
  ALTER TABLE "managers" ADD COLUMN "last_registration_digest_sent_at" timestamp(3) with time zone;
  ALTER TABLE "managers" DROP COLUMN "digest_watermarks";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "atlas_snapshots_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "registration_refusals_id";
  DROP TYPE "public"."enum_registration_refusals_stage";`)

  // The three rows #1070 added have no earlier spelling, so they are simply
  // dropped; the two renamed cadences go back to the names the old column
  // DEFAULT above names.
  await db.execute(sql`
  UPDATE "managers"
  SET "notification_preferences" =
    ("notification_preferences" - 'new_proposals' - 'open_items' - 'refused_signups' - 'statistics')
    || jsonb_build_object(
      'event_registration',
      CASE "notification_preferences" -> 'event_registration' ->> 'frequency'
        WHEN 'Daily' THEN
          ("notification_preferences" -> 'event_registration')
            || jsonb_build_object('frequency', 'Daily Summary')
        WHEN 'Weekly' THEN
          ("notification_preferences" -> 'event_registration')
            || jsonb_build_object('frequency', 'Weekly Summary')
        ELSE "notification_preferences" -> 'event_registration'
      END
    )
  WHERE "notification_preferences" IS NOT NULL
    AND jsonb_typeof("notification_preferences") = 'object';`)
}
