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
 *    they chose — and three of those spellings are gone. 'Daily Summary'
 *    becomes 'Daily' and 'Weekly Summary' becomes 'Weekly', so a manager on a
 *    summary cadence stays on it; `regional_summary` becomes `statistics`,
 *    which is the row #1070 gave its content to. Carrying the value rather
 *    than dropping the key is what keeps an opt-out an opt-out: the two rows
 *    offer the same `['Monthly', 'Never']` pair, so every value a manager
 *    could have chosen is one `statistics` accepts — anything else is
 *    off-contract already and is dropped rather than carried, because a pace
 *    the row never offered would mail on a cadence nobody picked. The
 *    precedent is `20260928_051738_add_manager_invitation_queue.ts`.
 * 4. **`down` puts all four back**, so the chain round-trips.
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
   ALTER TYPE "public"."enum_user_submissions_status" ADD VALUE 'confirmed_spam' BEFORE 'failed';
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
  ALTER TABLE "managers" DROP COLUMN "last_registration_digest_sent_at";`)

  // The DEFAULT above reaches new rows only, so every existing manager keeps
  // the cadence they chose — and three of those spellings are gone. Renaming
  // the value rather than clearing the key is what keeps a manager on 'Weekly
  // Summary' on 'Weekly' instead of silently back on the default, and a manager
  // who muted regional summaries muted rather than back on Monthly.
  await db.execute(sql`
  UPDATE "managers"
  SET "notification_preferences" = jsonb_strip_nulls(
    ("notification_preferences" - 'regional_summary')
    || CASE "notification_preferences" -> 'regional_summary' ->> 'frequency'
      WHEN 'Monthly' THEN
        jsonb_build_object('statistics', "notification_preferences" -> 'regional_summary')
      WHEN 'Never' THEN
        jsonb_build_object('statistics', "notification_preferences" -> 'regional_summary')
      ELSE '{}'::jsonb
    END
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
  ALTER TABLE "managers" ALTER COLUMN "notification_preferences" SET DEFAULT '{"invitation":{"frequency":"Immediate","method":"email"},"event_verification":{"frequency":"Monthly","method":"email"},"event_registration":{"frequency":"Immediate","method":"email"},"regional_summary":{"frequency":"Monthly","method":"email"}}'::jsonb;
  ALTER TABLE "managers" ADD COLUMN "last_registration_digest_sent_at" timestamp(3) with time zone;
  ALTER TABLE "managers" DROP COLUMN "digest_watermarks";`)

  // `statistics` carries what `regional_summary` chose, so it goes back under
  // that key; the other three rows #1070 added have no earlier spelling and are
  // simply dropped.
  //
  // ⚠ **Both branches are conditional, and `jsonb_strip_nulls` wraps the lot**,
  // because `jsonb_build_object` on an absent key writes a literal `null` rather
  // than nothing. Unconditional, this planted `regional_summary` on a manager
  // who never held one and `"event_registration": null` on every manager
  // without that row — measured against a throwaway Postgres, which is also how
  // the round trip above is known to be lossless.
  await db.execute(sql`
  UPDATE "managers"
  SET "notification_preferences" = jsonb_strip_nulls(
    ("notification_preferences" - 'new_proposals' - 'open_items' - 'refused_signups' - 'statistics')
    || CASE
      WHEN "notification_preferences" ? 'statistics' THEN
        jsonb_build_object('regional_summary', "notification_preferences" -> 'statistics')
      ELSE '{}'::jsonb
    END
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
  )
  WHERE "notification_preferences" IS NOT NULL
    AND jsonb_typeof("notification_preferences") = 'object';`)
}
