import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`app_cards_schedule_weekdays\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v_version_schedule_weekdays\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_first_date\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_firstdate_tz\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_start_date\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_start_time\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_end_time\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_timezone\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_monthly_mode\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_month_day\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_week_number\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_weekday_of_month\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_ending_type\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_count\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_until_date\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_first_date\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_firstdate_tz\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_start_date\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_start_time\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_end_time\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_timezone\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_monthly_mode\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_month_day\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_week_number\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_weekday_of_month\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_ending_type\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_count\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_until_date\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
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
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_start_date\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_start_time\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_end_time\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_timezone\` text DEFAULT 'Asia/Kuala_Lumpur';`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_monthly_mode\` text DEFAULT 'date';`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_month_day\` numeric DEFAULT 1;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_week_number\` text DEFAULT '1';`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_weekday_of_month\` text DEFAULT '0';`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_ending_type\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_count\` numeric DEFAULT 10;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`schedule_until_date\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_first_date\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`schedule_firstdate_tz\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_start_date\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_start_time\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_end_time\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_timezone\` text DEFAULT 'Asia/Kuala_Lumpur';`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_monthly_mode\` text DEFAULT 'date';`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_month_day\` numeric DEFAULT 1;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_week_number\` text DEFAULT '1';`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_weekday_of_month\` text DEFAULT '0';`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_ending_type\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_count\` numeric DEFAULT 10;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_schedule_until_date\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_first_date\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_schedule_firstdate_tz\`;`)
}
