import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Migration: Rename usage stats fields in clients table
 *
 * Part of the usagePlugin consolidation (#177):
 * - Renames usageStats group to usage
 * - Renames maxDailyRequests to peakDailyRequests
 * - Removes unused totalRequests field
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Rename columns
  await db.run(
    sql`ALTER TABLE \`clients\` RENAME COLUMN \`usage_stats_daily_requests\` TO \`usage_daily_requests\`;`,
  )
  await db.run(
    sql`ALTER TABLE \`clients\` RENAME COLUMN \`usage_stats_max_daily_requests\` TO \`usage_peak_daily_requests\`;`,
  )
  await db.run(
    sql`ALTER TABLE \`clients\` RENAME COLUMN \`usage_stats_last_request_at\` TO \`usage_last_request_at\`;`,
  )
  // Drop unused totalRequests column
  await db.run(sql`ALTER TABLE \`clients\` DROP COLUMN \`usage_stats_total_requests\`;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Add back totalRequests column
  await db.run(
    sql`ALTER TABLE \`clients\` ADD COLUMN \`usage_stats_total_requests\` numeric DEFAULT 0;`,
  )
  // Rename columns back
  await db.run(
    sql`ALTER TABLE \`clients\` RENAME COLUMN \`usage_daily_requests\` TO \`usage_stats_daily_requests\`;`,
  )
  await db.run(
    sql`ALTER TABLE \`clients\` RENAME COLUMN \`usage_peak_daily_requests\` TO \`usage_stats_max_daily_requests\`;`,
  )
  await db.run(
    sql`ALTER TABLE \`clients\` RENAME COLUMN \`usage_last_request_at\` TO \`usage_stats_last_request_at\`;`,
  )
}
