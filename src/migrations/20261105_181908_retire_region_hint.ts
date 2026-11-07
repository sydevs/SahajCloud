import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drops `user_submissions.region_hint` (#1068). `routing_region_id` now answers
 * who reviews a proposal and `region_id` where an accepted one is created, so
 * the JSON column held a second record of both.
 *
 * ⚠ **Ordered after `20261104_180154_routing_region`, whose backfill reads this
 * column.** Applied in timestamp order, so the routing region is copied out
 * before the column goes.
 *
 * ⚠ **`down` restores an empty column.** The keys are not recoverable, and
 * nothing reads them: `.anchorRegion` was only the Accept fallback for a
 * reviewer who cleared Region, and that Accept is now refused instead.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_submissions" DROP COLUMN "region_hint";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_submissions" ADD COLUMN "region_hint" jsonb;`)
}
