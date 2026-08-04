import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Trimmed after generation: the diff base is the newest-by-filename snapshot,
 * which was `20260730_172342_rename_region_level_center_to_venue.json` — authored
 * on a branch predating `schedule_last_date` and therefore missing it. The
 * generated file re-emitted that column and its indexes for `app_cards`,
 * `events` and both version tables, all of which `20260730_170909_schedule_last_date`
 * already ships; replaying them would fail on `ADD COLUMN` and abort the boot
 * migration. Only the two new quality columns are kept. The `.json` snapshot is
 * as generated — it holds the full current schema, which heals the chain for the
 * next `migrate:create`. See the out-of-order snapshot trap in
 * `.claude/rules/migrations.md`.
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
