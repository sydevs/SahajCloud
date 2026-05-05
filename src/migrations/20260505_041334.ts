import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`audiences_country\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`audiences_country_order_idx\` ON \`audiences_country\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`audiences_country_parent_idx\` ON \`audiences_country\` (\`parent_id\`);`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`type\` text DEFAULT 'progress' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`path_progress_min\` numeric;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`path_progress_max\` numeric;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`meditations_per_week_min\` numeric;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`meditations_per_week_max\` numeric;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`total_meditations_viewed_min\` numeric;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`total_meditations_viewed_max\` numeric;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`total_lectures_viewed_min\` numeric;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`total_lectures_viewed_max\` numeric;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`event_time\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`eventtime_tz\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`schedule_first_date\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`schedule_firstdate_tz\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`schedule_end_time\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`schedule_recurrence_type\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`schedule_interval\` numeric DEFAULT 1;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`rules\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`audiences_country\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`rules\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`type\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`path_progress_min\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`path_progress_max\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`meditations_per_week_min\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`meditations_per_week_max\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`total_meditations_viewed_min\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`total_meditations_viewed_max\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`total_lectures_viewed_min\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`total_lectures_viewed_max\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`event_time\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`eventtime_tz\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`schedule_first_date\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`schedule_firstdate_tz\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`schedule_end_time\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`schedule_recurrence_type\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`schedule_interval\`;`)
}
