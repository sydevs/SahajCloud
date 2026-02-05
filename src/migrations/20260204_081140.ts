import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Migration: Add schedule fields to App Cards
 *
 * Rewritten to work with actual production state where:
 * - 20260203_062524 created initial `cards` tables
 * - 20260203_090000 renamed `cards` → `app_cards` and updated payload_locked_documents_rels
 *
 * This migration adds schedule fields to the existing `app_cards` table using ALTER TABLE
 * instead of recreating the entire table.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Clean up from any previous failed migration attempt
  await db.run(sql`DROP TABLE IF EXISTS \`app_cards_schedule_weekdays\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`_app_cards_v_version_schedule_weekdays\`;`)

  // Create schedule weekdays table
  await db.run(sql`CREATE TABLE \`app_cards_schedule_weekdays\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`app_cards_schedule_weekdays_order_idx\` ON \`app_cards_schedule_weekdays\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_schedule_weekdays_parent_idx\` ON \`app_cards_schedule_weekdays\` (\`parent_id\`);`)

  // Add schedule columns to existing app_cards table
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_start_date\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_start_time\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_end_time\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_timezone\` text DEFAULT 'Asia/Kuala_Lumpur';`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_recurrence_type\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_interval\` numeric DEFAULT 1;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_monthly_mode\` text DEFAULT 'date';`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_month_day\` numeric DEFAULT 1;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_week_number\` text DEFAULT '1';`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_weekday_of_month\` text DEFAULT '0';`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_ending_type\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_count\` numeric DEFAULT 10;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_until_date\` text;`)

  // Remove old recurrence field
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`recurrence\`;`)

  // Create version schedule weekdays table
  await db.run(sql`CREATE TABLE \`_app_cards_v_version_schedule_weekdays\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_app_cards_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_schedule_weekdays_order_idx\` ON \`_app_cards_v_version_schedule_weekdays\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_schedule_weekdays_parent_idx\` ON \`_app_cards_v_version_schedule_weekdays\` (\`parent_id\`);`)

  // Add version schedule columns to existing _app_cards_v table
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_start_date\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_start_time\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_end_time\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_timezone\` text DEFAULT 'Asia/Kuala_Lumpur';`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_recurrence_type\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_interval\` numeric DEFAULT 1;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_monthly_mode\` text DEFAULT 'date';`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_month_day\` numeric DEFAULT 1;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_week_number\` text DEFAULT '1';`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_weekday_of_month\` text DEFAULT '0';`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_ending_type\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_count\` numeric DEFAULT 10;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_until_date\` text;`)

  // Remove old version recurrence field
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_recurrence\`;`)

  // Note: payload_locked_documents_rels already has app_cards_id from the rename migration (20260203_090000)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Re-add old recurrence field
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`recurrence\` text;`)

  // Remove schedule columns from app_cards
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_start_date\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_start_time\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_end_time\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_timezone\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_recurrence_type\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_interval\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_monthly_mode\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_month_day\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_week_number\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_weekday_of_month\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_ending_type\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_count\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_until_date\`;`)

  // Re-add old version recurrence field
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_recurrence\` text;`)

  // Remove version schedule columns from _app_cards_v
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_start_date\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_start_time\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_end_time\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_timezone\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_recurrence_type\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_interval\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_monthly_mode\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_month_day\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_week_number\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_weekday_of_month\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_ending_type\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_count\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_until_date\`;`)

  // Drop schedule weekdays tables
  await db.run(sql`DROP TABLE \`app_cards_schedule_weekdays\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v_version_schedule_weekdays\`;`)
}
