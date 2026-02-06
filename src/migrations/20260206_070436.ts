import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
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
  	\`url\` text,
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
  await db.run(sql`INSERT INTO \`__new_meditation_tags\`("id", "generate_slug", "slug", "color", "parent_id", "is_featured", "order", "is_parent", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "generate_slug", "slug", "color", "parent_id", "is_featured", "order", "is_parent", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditation_tags\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags\` RENAME TO \`meditation_tags\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_slug_idx\` ON \`meditation_tags\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_parent_idx\` ON \`meditation_tags\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_is_parent_idx\` ON \`meditation_tags\` (\`is_parent\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_updated_at_idx\` ON \`meditation_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_created_at_idx\` ON \`meditation_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_filename_idx\` ON \`meditation_tags\` (\`filename\`);`)
  await db.run(sql`ALTER TABLE \`meditations\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` ADD \`version_url\` text;`)
  await db.run(sql`ALTER TABLE \`songs\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`albums\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`videos\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`images\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`files\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`song_tags\` ADD \`url\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text NOT NULL,
  	\`color\` text DEFAULT '#000000' NOT NULL,
  	\`parent_id\` integer,
  	\`is_featured\` integer DEFAULT false NOT NULL,
  	\`order\` numeric DEFAULT 0,
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
  await db.run(sql`ALTER TABLE \`meditations\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` DROP COLUMN \`version_url\`;`)
  await db.run(sql`ALTER TABLE \`songs\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`videos\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`frames\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`images\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`files\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`song_tags\` DROP COLUMN \`url\`;`)
}
