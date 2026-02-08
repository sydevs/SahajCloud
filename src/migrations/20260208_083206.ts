import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`wm_app_config_locales\` (
  	\`self_realization_meditation_id\` integer,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`self_realization_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`wm_app_config\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`wm_app_config_self_realization_meditation_idx\` ON \`wm_app_config_locales\` (\`self_realization_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`wm_app_config_locales_locale_parent_id_unique\` ON \`wm_app_config_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_wm_app_config\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`INSERT INTO \`__new_wm_app_config\`("id", "updated_at", "created_at") SELECT "id", "updated_at", "created_at" FROM \`wm_app_config\`;`)
  await db.run(sql`DROP TABLE \`wm_app_config\`;`)
  await db.run(sql`ALTER TABLE \`__new_wm_app_config\` RENAME TO \`wm_app_config\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`wm_app_config_locales\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`self_realization_meditation_id\` integer REFERENCES meditations(id);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_self_realization_meditation_idx\` ON \`wm_app_config\` (\`self_realization_meditation_id\`);`)
}
