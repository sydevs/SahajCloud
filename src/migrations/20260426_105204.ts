import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text NOT NULL,
  	\`color\` text DEFAULT '#000000',
  	\`parent_id\` integer,
  	\`is_featured\` integer DEFAULT false,
  	\`order\` numeric DEFAULT 1,
  	\`is_parent\` integer DEFAULT false NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditation_tags\`("id", "generate_slug", "slug", "color", "parent_id", "is_featured", "order", "is_parent", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "generate_slug", "slug", "color", "parent_id", "is_featured", "order", "is_parent", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditation_tags\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags\` RENAME TO \`meditation_tags\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_slug_idx\` ON \`meditation_tags\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_parent_idx\` ON \`meditation_tags\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_is_parent_idx\` ON \`meditation_tags\` (\`is_parent\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_updated_at_idx\` ON \`meditation_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_created_at_idx\` ON \`meditation_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_filename_idx\` ON \`meditation_tags\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags_locales\` (
  	\`title\` text,
  	\`morning_meditation_id\` integer,
  	\`afternoon_meditation_id\` integer,
  	\`evening_meditation_id\` integer,
  	\`night_meditation_id\` integer,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`morning_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`afternoon_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`evening_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`night_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditation_tags_locales\`("title", "morning_meditation_id", "afternoon_meditation_id", "evening_meditation_id", "night_meditation_id", "id", "_locale", "_parent_id") SELECT "title", "morning_meditation_id", "afternoon_meditation_id", "evening_meditation_id", "night_meditation_id", "id", "_locale", "_parent_id" FROM \`meditation_tags_locales\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags_locales\` RENAME TO \`meditation_tags_locales\`;`)
  await db.run(sql`CREATE INDEX \`meditation_tags_morning_meditation_idx\` ON \`meditation_tags_locales\` (\`morning_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_afternoon_meditation_idx\` ON \`meditation_tags_locales\` (\`afternoon_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_evening_meditation_idx\` ON \`meditation_tags_locales\` (\`evening_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_night_meditation_idx\` ON \`meditation_tags_locales\` (\`night_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_locales_locale_parent_id_unique\` ON \`meditation_tags_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`lectures_nirmal_vidya_vimeo_url_idx\` ON \`lectures\` (\`nirmal_vidya_vimeo_url\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`lectures_nirmal_vidya_vimeo_url_idx\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text NOT NULL,
  	\`color\` text DEFAULT '#000000' NOT NULL,
  	\`parent_id\` integer,
  	\`is_featured\` integer DEFAULT false NOT NULL,
  	\`order\` numeric DEFAULT 1,
  	\`is_parent\` integer DEFAULT false NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditation_tags\`("id", "generate_slug", "slug", "color", "parent_id", "is_featured", "order", "is_parent", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "generate_slug", "slug", "color", "parent_id", "is_featured", "order", "is_parent", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditation_tags\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags\` RENAME TO \`meditation_tags\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_slug_idx\` ON \`meditation_tags\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_parent_idx\` ON \`meditation_tags\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_is_parent_idx\` ON \`meditation_tags\` (\`is_parent\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_updated_at_idx\` ON \`meditation_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_created_at_idx\` ON \`meditation_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_filename_idx\` ON \`meditation_tags\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags_locales\` (
  	\`title\` text NOT NULL,
  	\`morning_meditation_id\` integer,
  	\`afternoon_meditation_id\` integer,
  	\`evening_meditation_id\` integer,
  	\`night_meditation_id\` integer,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`morning_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`afternoon_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`evening_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`night_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditation_tags_locales\`("title", "morning_meditation_id", "afternoon_meditation_id", "evening_meditation_id", "night_meditation_id", "id", "_locale", "_parent_id") SELECT "title", "morning_meditation_id", "afternoon_meditation_id", "evening_meditation_id", "night_meditation_id", "id", "_locale", "_parent_id" FROM \`meditation_tags_locales\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags_locales\` RENAME TO \`meditation_tags_locales\`;`)
  await db.run(sql`CREATE INDEX \`meditation_tags_morning_meditation_idx\` ON \`meditation_tags_locales\` (\`morning_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_afternoon_meditation_idx\` ON \`meditation_tags_locales\` (\`afternoon_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_evening_meditation_idx\` ON \`meditation_tags_locales\` (\`evening_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_night_meditation_idx\` ON \`meditation_tags_locales\` (\`night_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_locales_locale_parent_id_unique\` ON \`meditation_tags_locales\` (\`_locale\`,\`_parent_id\`);`)
}
