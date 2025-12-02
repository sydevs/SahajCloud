import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`managers_roles\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`locale\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`managers_roles_order_idx\` ON \`managers_roles\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`managers_roles_parent_idx\` ON \`managers_roles\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`managers_roles_locale_idx\` ON \`managers_roles\` (\`locale\`);`)
  await db.run(sql`CREATE TABLE \`managers_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`pages_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`managers_rels_order_idx\` ON \`managers_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`managers_rels_parent_idx\` ON \`managers_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`managers_rels_path_idx\` ON \`managers_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`managers_rels_pages_id_idx\` ON \`managers_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE TABLE \`clients_roles\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`clients_roles_order_idx\` ON \`clients_roles\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`clients_roles_parent_idx\` ON \`clients_roles\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`we_meditate_app_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`app_version\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`we_meditate_app_settings_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`meditations_id\` integer,
  	\`lessons_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`we_meditate_app_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lessons_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`we_meditate_app_settings_rels_order_idx\` ON \`we_meditate_app_settings_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_app_settings_rels_parent_idx\` ON \`we_meditate_app_settings_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_app_settings_rels_path_idx\` ON \`we_meditate_app_settings_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_app_settings_rels_meditations_id_idx\` ON \`we_meditate_app_settings_rels\` (\`meditations_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_app_settings_rels_lessons_id_idx\` ON \`we_meditate_app_settings_rels\` (\`lessons_id\`);`)
  await db.run(sql`CREATE TABLE \`sahaj_atlas_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`atlas_version\` text,
  	\`default_map_center_latitude\` numeric DEFAULT 0 NOT NULL,
  	\`default_map_center_longitude\` numeric DEFAULT 0 NOT NULL,
  	\`default_zoom_level\` numeric DEFAULT 10,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`DROP TABLE \`managers_permissions\`;`)
  await db.run(sql`DROP TABLE \`clients_permissions\`;`)
  await db.run(sql`ALTER TABLE \`managers\` ADD \`current_project\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`managers_permissions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`allowed_collection\` text,
  	\`level\` text,
  	\`locale\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`managers_permissions_order_idx\` ON \`managers_permissions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`managers_permissions_parent_id_idx\` ON \`managers_permissions\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`clients_permissions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`allowed_collection\` text,
  	\`level\` text,
  	\`locale\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`clients_permissions_order_idx\` ON \`clients_permissions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`clients_permissions_parent_id_idx\` ON \`clients_permissions\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`managers_roles\`;`)
  await db.run(sql`DROP TABLE \`managers_rels\`;`)
  await db.run(sql`DROP TABLE \`clients_roles\`;`)
  await db.run(sql`DROP TABLE \`we_meditate_app_settings\`;`)
  await db.run(sql`DROP TABLE \`we_meditate_app_settings_rels\`;`)
  await db.run(sql`DROP TABLE \`sahaj_atlas_settings\`;`)
  await db.run(sql`ALTER TABLE \`managers\` DROP COLUMN \`current_project\`;`)
}
