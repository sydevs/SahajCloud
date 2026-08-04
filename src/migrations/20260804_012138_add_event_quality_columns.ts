import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Trimmed after generation — the out-of-order snapshot trap in
 * `.claude/rules/migrations.md`.
 *
 * `migrate:create` diffs against the newest-**by-filename** snapshot, which was
 * `20260803_221051_registrations_full_flag.json`. That one came off a branch
 * that predated four already-merged changes, so the generated file re-emitted
 * all of them: `events.contact_email` (20260729_222924),
 * `events.address_venue_name` + `sy_atlas_translations.event_title`
 * (20260730_171520), and a full drop/recreate of `enum_regions_level`
 * (20260730_172342). Replaying any of the `ADD COLUMN`s fails, and the enum
 * drop/recreate is destructive besides — its `USING` cast throws on existing
 * rows. All of it would abort the in-process boot migration on deploy.
 *
 * Only this branch's own two columns are kept. The `.json` snapshot is left
 * exactly as generated: it holds the **full current schema**, which is what
 * heals the chain for the next `migrate:create`.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" ADD COLUMN "quality_open_count" numeric;
  ALTER TABLE "events" ADD COLUMN "quality_check_version" numeric;
  ALTER TABLE "_events_v" ADD COLUMN "version_quality_open_count" numeric;
  ALTER TABLE "_events_v" ADD COLUMN "version_quality_check_version" numeric;
  CREATE INDEX "events_quality_open_count_idx" ON "events" USING btree ("quality_open_count");
  CREATE INDEX "_events_v_version_version_quality_open_count_idx" ON "_events_v" USING btree ("version_quality_open_count");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "events_quality_open_count_idx";
  DROP INDEX "_events_v_version_version_quality_open_count_idx";
  ALTER TABLE "events" DROP COLUMN "quality_open_count";
  ALTER TABLE "events" DROP COLUMN "quality_check_version";
  ALTER TABLE "_events_v" DROP COLUMN "version_quality_open_count";
  ALTER TABLE "_events_v" DROP COLUMN "version_quality_check_version";`)
}
