import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`meditation_tags_breadcrumbs\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text NOT NULL,
  	\`color\` text DEFAULT '#000000' NOT NULL,
  	\`parent_id\` integer,
  	\`is_featured\` integer DEFAULT false NOT NULL,
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
  await db.run(sql`INSERT INTO \`__new_meditation_tags\`("id", "generate_slug", "slug", "color", "parent_id", "is_featured", "is_parent", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "generate_slug", "slug", "color", "parent_id", "is_featured", "is_parent", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditation_tags\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags\` RENAME TO \`meditation_tags\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_slug_idx\` ON \`meditation_tags\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_parent_idx\` ON \`meditation_tags\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_updated_at_idx\` ON \`meditation_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_created_at_idx\` ON \`meditation_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_filename_idx\` ON \`meditation_tags\` (\`filename\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`meditation_tags_breadcrumbs\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`doc_id\` integer,
  	\`url\` text,
  	\`label\` text,
  	FOREIGN KEY (\`doc_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`meditation_tags_breadcrumbs_order_idx\` ON \`meditation_tags_breadcrumbs\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_breadcrumbs_parent_id_idx\` ON \`meditation_tags_breadcrumbs\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_breadcrumbs_locale_idx\` ON \`meditation_tags_breadcrumbs\` (\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_breadcrumbs_doc_idx\` ON \`meditation_tags_breadcrumbs\` (\`doc_id\`);`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text NOT NULL,
  	\`color\` text DEFAULT '#000000' NOT NULL,
  	\`is_featured\` integer DEFAULT false,
  	\`is_parent\` integer DEFAULT false,
  	\`parent_id\` integer,
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
  await db.run(sql`INSERT INTO \`__new_meditation_tags\`("id", "generate_slug", "slug", "color", "is_featured", "is_parent", "parent_id", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "generate_slug", "slug", "color", "is_featured", "is_parent", "parent_id", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditation_tags\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags\` RENAME TO \`meditation_tags\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_slug_idx\` ON \`meditation_tags\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_parent_idx\` ON \`meditation_tags\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_updated_at_idx\` ON \`meditation_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_created_at_idx\` ON \`meditation_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_filename_idx\` ON \`meditation_tags\` (\`filename\`);`)
}
