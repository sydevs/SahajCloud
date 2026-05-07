import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`app_cards_locales\` RENAME COLUMN "header" TO "default_header";`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` RENAME COLUMN "title" TO "default_title";`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` RENAME COLUMN "subtitle" TO "default_subtitle";`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` RENAME COLUMN "button" TO "default_button";`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` RENAME COLUMN "link_url" TO "default_url";`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` RENAME COLUMN "version_header" TO "version_default_header";`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` RENAME COLUMN "version_title" TO "version_default_title";`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` RENAME COLUMN "version_subtitle" TO "version_default_subtitle";`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` RENAME COLUMN "version_button" TO "version_default_button";`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` RENAME COLUMN "version_link_url" TO "version_default_url";`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_app_cards\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`type\` text DEFAULT 'standard',
  	\`default_image_id\` integer,
  	\`default_overlay\` integer DEFAULT false,
  	\`default_destination\` text,
  	\`default_app_page\` text,
  	\`default_lecture_id\` integer,
  	\`default_album_id\` integer,
  	\`default_meditation_id\` integer,
  	\`starting_soon_enabled\` integer DEFAULT false,
  	\`starting_soon_threshold\` text DEFAULT '1:00',
  	\`starting_soon_image_id\` integer,
  	\`starting_soon_overlay\` integer DEFAULT false,
  	\`starting_soon_destination\` text,
  	\`starting_soon_app_page\` text,
  	\`starting_soon_lecture_id\` integer,
  	\`starting_soon_album_id\` integer,
  	\`starting_soon_meditation_id\` integer,
  	\`live_now_enabled\` integer DEFAULT false,
  	\`live_now_threshold\` text DEFAULT '0:00',
  	\`live_now_image_id\` integer,
  	\`live_now_overlay\` integer DEFAULT false,
  	\`live_now_destination\` text,
  	\`live_now_app_page\` text,
  	\`live_now_lecture_id\` integer,
  	\`live_now_album_id\` integer,
  	\`live_now_meditation_id\` integer,
  	\`schedule_first_date\` text,
  	\`schedule_firstdate_tz\` text,
  	\`schedule_end_time\` text,
  	\`schedule_recurrence_type\` text,
  	\`schedule_interval\` numeric DEFAULT 1,
  	\`weight\` numeric DEFAULT 3,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`default_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`default_lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`default_album_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`default_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`starting_soon_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`starting_soon_lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`starting_soon_album_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`starting_soon_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`live_now_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`live_now_lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`live_now_album_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`live_now_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_app_cards\`("id", "type", "default_image_id", "default_overlay", "default_destination", "default_app_page", "default_lecture_id", "default_album_id", "default_meditation_id", "starting_soon_enabled", "starting_soon_threshold", "starting_soon_image_id", "starting_soon_overlay", "starting_soon_destination", "starting_soon_app_page", "starting_soon_lecture_id", "starting_soon_album_id", "starting_soon_meditation_id", "live_now_enabled", "live_now_threshold", "live_now_image_id", "live_now_overlay", "live_now_destination", "live_now_app_page", "live_now_lecture_id", "live_now_album_id", "live_now_meditation_id", "schedule_first_date", "schedule_firstdate_tz", "schedule_end_time", "schedule_recurrence_type", "schedule_interval", "weight", "updated_at", "created_at", "_status") SELECT "id", "type", "default_image_id", "default_overlay", "default_destination", "default_app_page", "default_lecture_id", "default_album_id", "default_meditation_id", "starting_soon_enabled", "starting_soon_threshold", "starting_soon_image_id", "starting_soon_overlay", "starting_soon_destination", "starting_soon_app_page", "starting_soon_lecture_id", "starting_soon_album_id", "starting_soon_meditation_id", "live_now_enabled", "live_now_threshold", "live_now_image_id", "live_now_overlay", "live_now_destination", "live_now_app_page", "live_now_lecture_id", "live_now_album_id", "live_now_meditation_id", "schedule_first_date", "schedule_firstdate_tz", "schedule_end_time", "schedule_recurrence_type", "schedule_interval", "weight", "updated_at", "created_at", "_status" FROM \`app_cards\`;`)
  await db.run(sql`DROP TABLE \`app_cards\`;`)
  await db.run(sql`ALTER TABLE \`__new_app_cards\` RENAME TO \`app_cards\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`app_cards_default_default_image_idx\` ON \`app_cards\` (\`default_image_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_default_default_lecture_idx\` ON \`app_cards\` (\`default_lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_default_default_album_idx\` ON \`app_cards\` (\`default_album_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_default_default_meditation_idx\` ON \`app_cards\` (\`default_meditation_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_starting_soon_starting_soon_image_idx\` ON \`app_cards\` (\`starting_soon_image_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_starting_soon_starting_soon_lecture_idx\` ON \`app_cards\` (\`starting_soon_lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_starting_soon_starting_soon_album_idx\` ON \`app_cards\` (\`starting_soon_album_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_starting_soon_starting_soon_meditation_idx\` ON \`app_cards\` (\`starting_soon_meditation_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_live_now_live_now_image_idx\` ON \`app_cards\` (\`live_now_image_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_live_now_live_now_lecture_idx\` ON \`app_cards\` (\`live_now_lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_live_now_live_now_album_idx\` ON \`app_cards\` (\`live_now_album_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_live_now_live_now_meditation_idx\` ON \`app_cards\` (\`live_now_meditation_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_updated_at_idx\` ON \`app_cards\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_created_at_idx\` ON \`app_cards\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`app_cards__status_idx\` ON \`app_cards\` (\`_status\`);`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` ADD \`starting_soon_header\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` ADD \`starting_soon_title\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` ADD \`starting_soon_subtitle\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` ADD \`starting_soon_button\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` ADD \`starting_soon_url\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` ADD \`live_now_header\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` ADD \`live_now_title\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` ADD \`live_now_subtitle\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` ADD \`live_now_button\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` ADD \`live_now_url\` text;`)
  await db.run(sql`CREATE TABLE \`__new__app_cards_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_type\` text DEFAULT 'standard',
  	\`version_default_image_id\` integer,
  	\`version_default_overlay\` integer DEFAULT false,
  	\`version_default_destination\` text,
  	\`version_default_app_page\` text,
  	\`version_default_lecture_id\` integer,
  	\`version_default_album_id\` integer,
  	\`version_default_meditation_id\` integer,
  	\`version_starting_soon_enabled\` integer DEFAULT false,
  	\`version_starting_soon_threshold\` text DEFAULT '1:00',
  	\`version_starting_soon_image_id\` integer,
  	\`version_starting_soon_overlay\` integer DEFAULT false,
  	\`version_starting_soon_destination\` text,
  	\`version_starting_soon_app_page\` text,
  	\`version_starting_soon_lecture_id\` integer,
  	\`version_starting_soon_album_id\` integer,
  	\`version_starting_soon_meditation_id\` integer,
  	\`version_live_now_enabled\` integer DEFAULT false,
  	\`version_live_now_threshold\` text DEFAULT '0:00',
  	\`version_live_now_image_id\` integer,
  	\`version_live_now_overlay\` integer DEFAULT false,
  	\`version_live_now_destination\` text,
  	\`version_live_now_app_page\` text,
  	\`version_live_now_lecture_id\` integer,
  	\`version_live_now_album_id\` integer,
  	\`version_live_now_meditation_id\` integer,
  	\`version_schedule_first_date\` text,
  	\`version_schedule_firstdate_tz\` text,
  	\`version_schedule_end_time\` text,
  	\`version_schedule_recurrence_type\` text,
  	\`version_schedule_interval\` numeric DEFAULT 1,
  	\`version_weight\` numeric DEFAULT 3,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_default_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_default_lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_default_album_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_default_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_starting_soon_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_starting_soon_lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_starting_soon_album_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_starting_soon_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_live_now_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_live_now_lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_live_now_album_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_live_now_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__app_cards_v\`("id", "parent_id", "version_type", "version_default_image_id", "version_default_overlay", "version_default_destination", "version_default_app_page", "version_default_lecture_id", "version_default_album_id", "version_default_meditation_id", "version_starting_soon_enabled", "version_starting_soon_threshold", "version_starting_soon_image_id", "version_starting_soon_overlay", "version_starting_soon_destination", "version_starting_soon_app_page", "version_starting_soon_lecture_id", "version_starting_soon_album_id", "version_starting_soon_meditation_id", "version_live_now_enabled", "version_live_now_threshold", "version_live_now_image_id", "version_live_now_overlay", "version_live_now_destination", "version_live_now_app_page", "version_live_now_lecture_id", "version_live_now_album_id", "version_live_now_meditation_id", "version_schedule_first_date", "version_schedule_firstdate_tz", "version_schedule_end_time", "version_schedule_recurrence_type", "version_schedule_interval", "version_weight", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version_type", "version_default_image_id", "version_default_overlay", "version_default_destination", "version_default_app_page", "version_default_lecture_id", "version_default_album_id", "version_default_meditation_id", "version_starting_soon_enabled", "version_starting_soon_threshold", "version_starting_soon_image_id", "version_starting_soon_overlay", "version_starting_soon_destination", "version_starting_soon_app_page", "version_starting_soon_lecture_id", "version_starting_soon_album_id", "version_starting_soon_meditation_id", "version_live_now_enabled", "version_live_now_threshold", "version_live_now_image_id", "version_live_now_overlay", "version_live_now_destination", "version_live_now_app_page", "version_live_now_lecture_id", "version_live_now_album_id", "version_live_now_meditation_id", "version_schedule_first_date", "version_schedule_firstdate_tz", "version_schedule_end_time", "version_schedule_recurrence_type", "version_schedule_interval", "version_weight", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_app_cards_v\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__app_cards_v\` RENAME TO \`_app_cards_v\`;`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_parent_idx\` ON \`_app_cards_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_default_version_default_image_idx\` ON \`_app_cards_v\` (\`version_default_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_default_version_default_lecture_idx\` ON \`_app_cards_v\` (\`version_default_lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_default_version_default_album_idx\` ON \`_app_cards_v\` (\`version_default_album_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_default_version_default_meditation_idx\` ON \`_app_cards_v\` (\`version_default_meditation_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_soon_idx\` ON \`_app_cards_v\` (\`version_starting_soon_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_so_1_idx\` ON \`_app_cards_v\` (\`version_starting_soon_lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_so_2_idx\` ON \`_app_cards_v\` (\`version_starting_soon_album_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_so_3_idx\` ON \`_app_cards_v\` (\`version_starting_soon_meditation_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_live_now_version_live_now_image_idx\` ON \`_app_cards_v\` (\`version_live_now_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_live_now_version_live_now_lecture_idx\` ON \`_app_cards_v\` (\`version_live_now_lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_live_now_version_live_now_album_idx\` ON \`_app_cards_v\` (\`version_live_now_album_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_live_now_version_live_now_meditatio_idx\` ON \`_app_cards_v\` (\`version_live_now_meditation_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_updated_at_idx\` ON \`_app_cards_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_created_at_idx\` ON \`_app_cards_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version__status_idx\` ON \`_app_cards_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_created_at_idx\` ON \`_app_cards_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_updated_at_idx\` ON \`_app_cards_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_snapshot_idx\` ON \`_app_cards_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_published_locale_idx\` ON \`_app_cards_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_latest_idx\` ON \`_app_cards_v\` (\`latest\`);`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` ADD \`version_starting_soon_header\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` ADD \`version_starting_soon_title\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` ADD \`version_starting_soon_subtitle\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` ADD \`version_starting_soon_button\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` ADD \`version_starting_soon_url\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` ADD \`version_live_now_header\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` ADD \`version_live_now_title\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` ADD \`version_live_now_subtitle\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` ADD \`version_live_now_button\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` ADD \`version_live_now_url\` text;`)
  await db.run(sql`CREATE TABLE \`__new_app_cards_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`audiences_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_app_cards_rels\`("id", "order", "parent_id", "path", "audiences_id") SELECT "id", "order", "parent_id", "path", "audiences_id" FROM \`app_cards_rels\`;`)
  await db.run(sql`DROP TABLE \`app_cards_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_app_cards_rels\` RENAME TO \`app_cards_rels\`;`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_order_idx\` ON \`app_cards_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_parent_idx\` ON \`app_cards_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_path_idx\` ON \`app_cards_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_audiences_id_idx\` ON \`app_cards_rels\` (\`audiences_id\`);`)
  await db.run(sql`CREATE TABLE \`__new__app_cards_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`audiences_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_app_cards_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new__app_cards_v_rels\`("id", "order", "parent_id", "path", "audiences_id") SELECT "id", "order", "parent_id", "path", "audiences_id" FROM \`_app_cards_v_rels\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new__app_cards_v_rels\` RENAME TO \`_app_cards_v_rels\`;`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_order_idx\` ON \`_app_cards_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_parent_idx\` ON \`_app_cards_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_path_idx\` ON \`_app_cards_v_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_audiences_id_idx\` ON \`_app_cards_v_rels\` (\`audiences_id\`);`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`event_time\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`eventtime_tz\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`schedule_first_date\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`schedule_firstdate_tz\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`schedule_end_time\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`schedule_recurrence_type\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`schedule_interval\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`app_cards_locales\` RENAME COLUMN "default_title" TO "title";`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` RENAME COLUMN "default_subtitle" TO "subtitle";`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` RENAME COLUMN "default_button" TO "button";`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` RENAME COLUMN "default_header" TO "header";`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` RENAME COLUMN "default_url" TO "link_url";`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` RENAME COLUMN "version_default_title" TO "version_title";`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` RENAME COLUMN "version_default_subtitle" TO "version_subtitle";`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` RENAME COLUMN "version_default_button" TO "version_button";`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` RENAME COLUMN "version_default_header" TO "version_header";`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` RENAME COLUMN "version_default_url" TO "version_link_url";`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_app_cards\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`image_id\` integer,
  	\`type\` text DEFAULT 'app-page',
  	\`app_page\` text,
  	\`countdown\` integer DEFAULT false,
  	\`overlay\` integer DEFAULT false,
  	\`schedule_first_date\` text,
  	\`schedule_firstdate_tz\` text,
  	\`schedule_recurrence_type\` text,
  	\`schedule_interval\` numeric DEFAULT 1,
  	\`weight\` numeric DEFAULT 3,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_app_cards\`("id", "image_id", "type", "app_page", "countdown", "overlay", "schedule_first_date", "schedule_firstdate_tz", "schedule_recurrence_type", "schedule_interval", "weight", "updated_at", "created_at", "_status") SELECT "id", "image_id", "type", "app_page", "countdown", "overlay", "schedule_first_date", "schedule_firstdate_tz", "schedule_recurrence_type", "schedule_interval", "weight", "updated_at", "created_at", "_status" FROM \`app_cards\`;`)
  await db.run(sql`DROP TABLE \`app_cards\`;`)
  await db.run(sql`ALTER TABLE \`__new_app_cards\` RENAME TO \`app_cards\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`app_cards_image_idx\` ON \`app_cards\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_updated_at_idx\` ON \`app_cards\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_created_at_idx\` ON \`app_cards\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`app_cards__status_idx\` ON \`app_cards\` (\`_status\`);`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` DROP COLUMN \`starting_soon_header\`;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` DROP COLUMN \`starting_soon_title\`;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` DROP COLUMN \`starting_soon_subtitle\`;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` DROP COLUMN \`starting_soon_button\`;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` DROP COLUMN \`starting_soon_url\`;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` DROP COLUMN \`live_now_header\`;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` DROP COLUMN \`live_now_title\`;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` DROP COLUMN \`live_now_subtitle\`;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` DROP COLUMN \`live_now_button\`;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` DROP COLUMN \`live_now_url\`;`)
  await db.run(sql`CREATE TABLE \`__new__app_cards_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_image_id\` integer,
  	\`version_type\` text DEFAULT 'app-page',
  	\`version_app_page\` text,
  	\`version_countdown\` integer DEFAULT false,
  	\`version_overlay\` integer DEFAULT false,
  	\`version_schedule_first_date\` text,
  	\`version_schedule_firstdate_tz\` text,
  	\`version_schedule_recurrence_type\` text,
  	\`version_schedule_interval\` numeric DEFAULT 1,
  	\`version_weight\` numeric DEFAULT 3,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__app_cards_v\`("id", "parent_id", "version_image_id", "version_type", "version_app_page", "version_countdown", "version_overlay", "version_schedule_first_date", "version_schedule_firstdate_tz", "version_schedule_recurrence_type", "version_schedule_interval", "version_weight", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version_image_id", "version_type", "version_app_page", "version_countdown", "version_overlay", "version_schedule_first_date", "version_schedule_firstdate_tz", "version_schedule_recurrence_type", "version_schedule_interval", "version_weight", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_app_cards_v\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__app_cards_v\` RENAME TO \`_app_cards_v\`;`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_parent_idx\` ON \`_app_cards_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_image_idx\` ON \`_app_cards_v\` (\`version_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_updated_at_idx\` ON \`_app_cards_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_created_at_idx\` ON \`_app_cards_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version__status_idx\` ON \`_app_cards_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_created_at_idx\` ON \`_app_cards_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_updated_at_idx\` ON \`_app_cards_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_snapshot_idx\` ON \`_app_cards_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_published_locale_idx\` ON \`_app_cards_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_latest_idx\` ON \`_app_cards_v\` (\`latest\`);`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` DROP COLUMN \`version_starting_soon_header\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` DROP COLUMN \`version_starting_soon_title\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` DROP COLUMN \`version_starting_soon_subtitle\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` DROP COLUMN \`version_starting_soon_button\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` DROP COLUMN \`version_starting_soon_url\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` DROP COLUMN \`version_live_now_header\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` DROP COLUMN \`version_live_now_title\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` DROP COLUMN \`version_live_now_subtitle\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` DROP COLUMN \`version_live_now_button\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` DROP COLUMN \`version_live_now_url\`;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`event_time\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`eventtime_tz\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`schedule_first_date\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`schedule_firstdate_tz\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`schedule_end_time\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`schedule_recurrence_type\` text;`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`schedule_interval\` numeric DEFAULT 1;`)
  await db.run(sql`ALTER TABLE \`app_cards_rels\` ADD \`lectures_id\` integer REFERENCES lectures(id);`)
  await db.run(sql`ALTER TABLE \`app_cards_rels\` ADD \`albums_id\` integer REFERENCES albums(id);`)
  await db.run(sql`ALTER TABLE \`app_cards_rels\` ADD \`meditations_id\` integer REFERENCES meditations(id);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_lectures_id_idx\` ON \`app_cards_rels\` (\`lectures_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_albums_id_idx\` ON \`app_cards_rels\` (\`albums_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_meditations_id_idx\` ON \`app_cards_rels\` (\`meditations_id\`);`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_rels\` ADD \`lectures_id\` integer REFERENCES lectures(id);`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_rels\` ADD \`albums_id\` integer REFERENCES albums(id);`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_rels\` ADD \`meditations_id\` integer REFERENCES meditations(id);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_lectures_id_idx\` ON \`_app_cards_v_rels\` (\`lectures_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_albums_id_idx\` ON \`_app_cards_v_rels\` (\`albums_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_meditations_id_idx\` ON \`_app_cards_v_rels\` (\`meditations_id\`);`)
}
