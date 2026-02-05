import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`meditation_tags_timings\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`meditation_tags_timings_order_idx\` ON \`meditation_tags_timings\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_timings_parent_idx\` ON \`meditation_tags_timings\` (\`parent_id\`);`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_meditations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`label\` text,
  	\`locale\` text,
  	\`narrator_id\` integer,
  	\`song_tag_id\` integer,
  	\`file_metadata\` text,
  	\`duration_minutes\` numeric,
  	\`title\` text,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text,
  	\`thumbnail_id\` integer,
  	\`type\` text DEFAULT 'daily',
  	\`frames\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	\`_status\` text DEFAULT 'draft',
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`narrator_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`song_tag_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditations\`("id", "label", "locale", "narrator_id", "song_tag_id", "file_metadata", "duration_minutes", "title", "generate_slug", "slug", "thumbnail_id", "type", "frames", "updated_at", "created_at", "deleted_at", "_status", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "label", "locale", "narrator_id", "song_tag_id", "file_metadata", "duration_minutes", "title", "generate_slug", "slug", "thumbnail_id", "type", "frames", "updated_at", "created_at", "deleted_at", "_status", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditations\`;`)
  await db.run(sql`DROP TABLE \`meditations\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditations\` RENAME TO \`meditations\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`meditations_narrator_idx\` ON \`meditations\` (\`narrator_id\`);`)
  await db.run(sql`CREATE INDEX \`meditations_song_tag_idx\` ON \`meditations\` (\`song_tag_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditations_slug_idx\` ON \`meditations\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditations_thumbnail_idx\` ON \`meditations\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`meditations_updated_at_idx\` ON \`meditations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations_created_at_idx\` ON \`meditations\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations_deleted_at_idx\` ON \`meditations\` (\`deleted_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations__status_idx\` ON \`meditations\` (\`_status\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditations_filename_idx\` ON \`meditations\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new__meditations_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_label\` text,
  	\`version_locale\` text,
  	\`version_narrator_id\` integer,
  	\`version_song_tag_id\` integer,
  	\`version_file_metadata\` text,
  	\`version_duration_minutes\` numeric,
  	\`version_title\` text,
  	\`version_generate_slug\` integer DEFAULT true,
  	\`version_slug\` text,
  	\`version_thumbnail_id\` integer,
  	\`version_type\` text DEFAULT 'daily',
  	\`version_frames\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version_deleted_at\` text,
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
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_narrator_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_song_tag_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__meditations_v\`("id", "parent_id", "version_label", "version_locale", "version_narrator_id", "version_song_tag_id", "version_file_metadata", "version_duration_minutes", "version_title", "version_generate_slug", "version_slug", "version_thumbnail_id", "version_type", "version_frames", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "version_thumbnail_u_r_l", "version_filename", "version_mime_type", "version_filesize", "version_width", "version_height", "version_focal_x", "version_focal_y", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version_label", "version_locale", "version_narrator_id", "version_song_tag_id", "version_file_metadata", "version_duration_minutes", "version_title", "version_generate_slug", "version_slug", "version_thumbnail_id", "version_type", "version_frames", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "version_thumbnail_u_r_l", "version_filename", "version_mime_type", "version_filesize", "version_width", "version_height", "version_focal_x", "version_focal_y", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_meditations_v\`;`)
  await db.run(sql`DROP TABLE \`_meditations_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__meditations_v\` RENAME TO \`_meditations_v\`;`)
  await db.run(sql`CREATE INDEX \`_meditations_v_parent_idx\` ON \`_meditations_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_narrator_idx\` ON \`_meditations_v\` (\`version_narrator_id\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_song_tag_idx\` ON \`_meditations_v\` (\`version_song_tag_id\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_slug_idx\` ON \`_meditations_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_thumbnail_idx\` ON \`_meditations_v\` (\`version_thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_updated_at_idx\` ON \`_meditations_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_created_at_idx\` ON \`_meditations_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_deleted_at_idx\` ON \`_meditations_v\` (\`version_deleted_at\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version__status_idx\` ON \`_meditations_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_filename_idx\` ON \`_meditations_v\` (\`version_filename\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_created_at_idx\` ON \`_meditations_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_updated_at_idx\` ON \`_meditations_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_snapshot_idx\` ON \`_meditations_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_published_locale_idx\` ON \`_meditations_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_latest_idx\` ON \`_meditations_v\` (\`latest\`);`)
  await db.run(sql`ALTER TABLE \`meditation_tags\` ADD \`parent_id\` integer REFERENCES meditation_tags(id);`)
  await db.run(sql`ALTER TABLE \`meditation_tags\` ADD \`is_featured\` integer DEFAULT false NOT NULL;`)
  await db.run(sql`ALTER TABLE \`meditation_tags\` ADD \`is_parent\` integer DEFAULT false NOT NULL;`)
  await db.run(sql`CREATE INDEX \`meditation_tags_parent_idx\` ON \`meditation_tags\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_is_parent_idx\` ON \`meditation_tags\` (\`is_parent\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`meditation_tags_timings\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text NOT NULL,
  	\`color\` text DEFAULT '#000000' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
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
  await db.run(sql`INSERT INTO \`__new_meditation_tags\`("id", "generate_slug", "slug", "color", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "generate_slug", "slug", "color", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditation_tags\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags\` RENAME TO \`meditation_tags\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_slug_idx\` ON \`meditation_tags\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_updated_at_idx\` ON \`meditation_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_created_at_idx\` ON \`meditation_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_filename_idx\` ON \`meditation_tags\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_meditations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`label\` text,
  	\`locale\` text DEFAULT 'en',
  	\`narrator_id\` integer,
  	\`song_tag_id\` integer,
  	\`file_metadata\` text,
  	\`duration_minutes\` numeric,
  	\`title\` text,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text,
  	\`thumbnail_id\` integer,
  	\`type\` text DEFAULT 'daily',
  	\`frames\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	\`_status\` text DEFAULT 'draft',
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`narrator_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`song_tag_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditations\`("id", "label", "locale", "narrator_id", "song_tag_id", "file_metadata", "duration_minutes", "title", "generate_slug", "slug", "thumbnail_id", "type", "frames", "updated_at", "created_at", "deleted_at", "_status", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "label", "locale", "narrator_id", "song_tag_id", "file_metadata", "duration_minutes", "title", "generate_slug", "slug", "thumbnail_id", "type", "frames", "updated_at", "created_at", "deleted_at", "_status", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditations\`;`)
  await db.run(sql`DROP TABLE \`meditations\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditations\` RENAME TO \`meditations\`;`)
  await db.run(sql`CREATE INDEX \`meditations_narrator_idx\` ON \`meditations\` (\`narrator_id\`);`)
  await db.run(sql`CREATE INDEX \`meditations_song_tag_idx\` ON \`meditations\` (\`song_tag_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditations_slug_idx\` ON \`meditations\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditations_thumbnail_idx\` ON \`meditations\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`meditations_updated_at_idx\` ON \`meditations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations_created_at_idx\` ON \`meditations\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations_deleted_at_idx\` ON \`meditations\` (\`deleted_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations__status_idx\` ON \`meditations\` (\`_status\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditations_filename_idx\` ON \`meditations\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new__meditations_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_label\` text,
  	\`version_locale\` text DEFAULT 'en',
  	\`version_narrator_id\` integer,
  	\`version_song_tag_id\` integer,
  	\`version_file_metadata\` text,
  	\`version_duration_minutes\` numeric,
  	\`version_title\` text,
  	\`version_generate_slug\` integer DEFAULT true,
  	\`version_slug\` text,
  	\`version_thumbnail_id\` integer,
  	\`version_type\` text DEFAULT 'daily',
  	\`version_frames\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version_deleted_at\` text,
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
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_narrator_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_song_tag_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__meditations_v\`("id", "parent_id", "version_label", "version_locale", "version_narrator_id", "version_song_tag_id", "version_file_metadata", "version_duration_minutes", "version_title", "version_generate_slug", "version_slug", "version_thumbnail_id", "version_type", "version_frames", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "version_thumbnail_u_r_l", "version_filename", "version_mime_type", "version_filesize", "version_width", "version_height", "version_focal_x", "version_focal_y", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version_label", "version_locale", "version_narrator_id", "version_song_tag_id", "version_file_metadata", "version_duration_minutes", "version_title", "version_generate_slug", "version_slug", "version_thumbnail_id", "version_type", "version_frames", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "version_thumbnail_u_r_l", "version_filename", "version_mime_type", "version_filesize", "version_width", "version_height", "version_focal_x", "version_focal_y", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_meditations_v\`;`)
  await db.run(sql`DROP TABLE \`_meditations_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__meditations_v\` RENAME TO \`_meditations_v\`;`)
  await db.run(sql`CREATE INDEX \`_meditations_v_parent_idx\` ON \`_meditations_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_narrator_idx\` ON \`_meditations_v\` (\`version_narrator_id\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_song_tag_idx\` ON \`_meditations_v\` (\`version_song_tag_id\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_slug_idx\` ON \`_meditations_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_thumbnail_idx\` ON \`_meditations_v\` (\`version_thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_updated_at_idx\` ON \`_meditations_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_created_at_idx\` ON \`_meditations_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_deleted_at_idx\` ON \`_meditations_v\` (\`version_deleted_at\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version__status_idx\` ON \`_meditations_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_version_version_filename_idx\` ON \`_meditations_v\` (\`version_filename\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_created_at_idx\` ON \`_meditations_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_updated_at_idx\` ON \`_meditations_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_snapshot_idx\` ON \`_meditations_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_published_locale_idx\` ON \`_meditations_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_latest_idx\` ON \`_meditations_v\` (\`latest\`);`)
}
