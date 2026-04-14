import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`_lectures_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_nirmal_vidya_vimeo_url\` text,
  	\`version_start_time\` numeric DEFAULT 0,
  	\`version_end_time\` numeric DEFAULT 600,
  	\`version_thumbnail_id\` integer,
  	\`version_video_url\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_lectures_v_parent_idx\` ON \`_lectures_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_version_version_thumbnail_idx\` ON \`_lectures_v\` (\`version_thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_version_version_updated_at_idx\` ON \`_lectures_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_version_version_created_at_idx\` ON \`_lectures_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_version_version__status_idx\` ON \`_lectures_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_created_at_idx\` ON \`_lectures_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_updated_at_idx\` ON \`_lectures_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_snapshot_idx\` ON \`_lectures_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_published_locale_idx\` ON \`_lectures_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_latest_idx\` ON \`_lectures_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_lectures_v_locales\` (
  	\`version_title\` text,
  	\`version_subtitles_url\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_lectures_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_lectures_v_locales_locale_parent_id_unique\` ON \`_lectures_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_lectures_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lecture_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_lectures_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lecture_tags_id\`) REFERENCES \`lecture_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_lectures_v_rels_order_idx\` ON \`_lectures_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_rels_parent_idx\` ON \`_lectures_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_rels_path_idx\` ON \`_lectures_v_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`_lectures_v_rels_lecture_tags_id_idx\` ON \`_lectures_v_rels\` (\`lecture_tags_id\`);`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lectures\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nirmal_vidya_vimeo_url\` text,
  	\`start_time\` numeric DEFAULT 0,
  	\`end_time\` numeric DEFAULT 600,
  	\`thumbnail_id\` integer,
  	\`video_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  // Note: source `lectures` table has no `_status` column yet — exclude it from the
  // SELECT so the new column receives its default ('draft'), then backfill below.
  await db.run(sql`INSERT INTO \`__new_lectures\`("id", "nirmal_vidya_vimeo_url", "start_time", "end_time", "thumbnail_id", "video_url", "updated_at", "created_at") SELECT "id", "nirmal_vidya_vimeo_url", "start_time", "end_time", "thumbnail_id", "video_url", "updated_at", "created_at" FROM \`lectures\`;`)
  await db.run(sql`DROP TABLE \`lectures\`;`)
  await db.run(sql`ALTER TABLE \`__new_lectures\` RENAME TO \`lectures\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`lectures_thumbnail_idx\` ON \`lectures\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_updated_at_idx\` ON \`lectures\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lectures_created_at_idx\` ON \`lectures\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`lectures__status_idx\` ON \`lectures\` (\`_status\`);`)

  // Backfill: every existing lecture should be published. Without this, the new
  // `_status` column defaults to 'draft' and /api/lectures/for-viewer returns [].
  await db.run(sql`UPDATE \`lectures\` SET \`_status\` = 'published';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`_lectures_v\`;`)
  await db.run(sql`DROP TABLE \`_lectures_v_locales\`;`)
  await db.run(sql`DROP TABLE \`_lectures_v_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lectures\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nirmal_vidya_vimeo_url\` text NOT NULL,
  	\`start_time\` numeric DEFAULT 0 NOT NULL,
  	\`end_time\` numeric DEFAULT 600 NOT NULL,
  	\`thumbnail_id\` integer,
  	\`video_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lectures\`("id", "nirmal_vidya_vimeo_url", "start_time", "end_time", "thumbnail_id", "video_url", "updated_at", "created_at") SELECT "id", "nirmal_vidya_vimeo_url", "start_time", "end_time", "thumbnail_id", "video_url", "updated_at", "created_at" FROM \`lectures\`;`)
  await db.run(sql`DROP TABLE \`lectures\`;`)
  await db.run(sql`ALTER TABLE \`__new_lectures\` RENAME TO \`lectures\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`lectures_thumbnail_idx\` ON \`lectures\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_updated_at_idx\` ON \`lectures\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lectures_created_at_idx\` ON \`lectures\` (\`created_at\`);`)
}
