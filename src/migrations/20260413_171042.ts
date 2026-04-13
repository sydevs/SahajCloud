import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`albums_filename_idx\`;`)
  await db.run(sql`ALTER TABLE \`albums\` ADD \`artwork_id\` integer NOT NULL REFERENCES images(id);`)
  await db.run(sql`CREATE INDEX \`albums_artwork_idx\` ON \`albums\` (\`artwork_id\`);`)
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`thumbnail_u_r_l\`;`)
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`filename\`;`)
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`mime_type\`;`)
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`filesize\`;`)
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`width\`;`)
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`height\`;`)
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`focal_x\`;`)
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`focal_y\`;`)
  await db.run(sql`DROP INDEX \`app_cards_filename_idx\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`image_id\` integer REFERENCES images(id);`)
  await db.run(sql`CREATE INDEX \`app_cards_image_idx\` ON \`app_cards\` (\`image_id\`);`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`thumbnail_u_r_l\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`filename\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`mime_type\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`filesize\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`width\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`height\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`focal_x\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`focal_y\`;`)
  await db.run(sql`DROP INDEX \`_app_cards_v_version_version_filename_idx\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_image_id\` integer REFERENCES images(id);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_image_idx\` ON \`_app_cards_v\` (\`version_image_id\`);`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_thumbnail_u_r_l\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_filename\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_mime_type\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_filesize\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_width\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_height\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_focal_x\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_focal_y\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_albums\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`artist_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric
  );
  `)
  await db.run(sql`INSERT INTO \`__new_albums\`("id", "artist_url", "updated_at", "created_at", "deleted_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "artist_url", "updated_at", "created_at", "deleted_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`albums\`;`)
  await db.run(sql`DROP TABLE \`albums\`;`)
  await db.run(sql`ALTER TABLE \`__new_albums\` RENAME TO \`albums\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`albums_updated_at_idx\` ON \`albums\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`albums_created_at_idx\` ON \`albums\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`albums_deleted_at_idx\` ON \`albums\` (\`deleted_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`albums_filename_idx\` ON \`albums\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_app_cards\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`type\` text DEFAULT 'app-page',
  	\`app_page\` text,
  	\`countdown\` integer DEFAULT false,
  	\`schedule_first_date\` text,
  	\`schedule_firstdate_tz\` text,
  	\`schedule_recurrence_type\` text,
  	\`schedule_interval\` numeric DEFAULT 1,
  	\`rules\` text,
  	\`weight\` numeric DEFAULT 3,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric
  );
  `)
  await db.run(sql`INSERT INTO \`__new_app_cards\`("id", "type", "app_page", "countdown", "schedule_first_date", "schedule_firstdate_tz", "schedule_recurrence_type", "schedule_interval", "rules", "weight", "updated_at", "created_at", "_status", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "type", "app_page", "countdown", "schedule_first_date", "schedule_firstdate_tz", "schedule_recurrence_type", "schedule_interval", "rules", "weight", "updated_at", "created_at", "_status", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`app_cards\`;`)
  await db.run(sql`DROP TABLE \`app_cards\`;`)
  await db.run(sql`ALTER TABLE \`__new_app_cards\` RENAME TO \`app_cards\`;`)
  await db.run(sql`CREATE INDEX \`app_cards_updated_at_idx\` ON \`app_cards\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_created_at_idx\` ON \`app_cards\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`app_cards__status_idx\` ON \`app_cards\` (\`_status\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`app_cards_filename_idx\` ON \`app_cards\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new__app_cards_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_type\` text DEFAULT 'app-page',
  	\`version_app_page\` text,
  	\`version_countdown\` integer DEFAULT false,
  	\`version_schedule_first_date\` text,
  	\`version_schedule_firstdate_tz\` text,
  	\`version_schedule_recurrence_type\` text,
  	\`version_schedule_interval\` numeric DEFAULT 1,
  	\`version_rules\` text,
  	\`version_weight\` numeric DEFAULT 3,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`version_thumbnail_u_r_l\` text,
  	\`version_filename\` text,
  	\`version_mime_type\` text,
  	\`version_filesize\` numeric,
  	\`version_width\` numeric,
  	\`version_height\` numeric,
  	\`version_focal_x\` numeric,
  	\`version_focal_y\` numeric,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__app_cards_v\`("id", "parent_id", "version_type", "version_app_page", "version_countdown", "version_schedule_first_date", "version_schedule_firstdate_tz", "version_schedule_recurrence_type", "version_schedule_interval", "version_rules", "version_weight", "version_updated_at", "version_created_at", "version__status", "version_thumbnail_u_r_l", "version_filename", "version_mime_type", "version_filesize", "version_width", "version_height", "version_focal_x", "version_focal_y", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version_type", "version_app_page", "version_countdown", "version_schedule_first_date", "version_schedule_firstdate_tz", "version_schedule_recurrence_type", "version_schedule_interval", "version_rules", "version_weight", "version_updated_at", "version_created_at", "version__status", "version_thumbnail_u_r_l", "version_filename", "version_mime_type", "version_filesize", "version_width", "version_height", "version_focal_x", "version_focal_y", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_app_cards_v\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__app_cards_v\` RENAME TO \`_app_cards_v\`;`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_parent_idx\` ON \`_app_cards_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_updated_at_idx\` ON \`_app_cards_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_created_at_idx\` ON \`_app_cards_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version__status_idx\` ON \`_app_cards_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_filename_idx\` ON \`_app_cards_v\` (\`version_filename\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_created_at_idx\` ON \`_app_cards_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_updated_at_idx\` ON \`_app_cards_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_snapshot_idx\` ON \`_app_cards_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_published_locale_idx\` ON \`_app_cards_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_latest_idx\` ON \`_app_cards_v\` (\`latest\`);`)
}
