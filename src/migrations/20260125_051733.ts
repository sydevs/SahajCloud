import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`we_meditate_web_settings_inspiration_page_tags\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`we_meditate_web_settings_inspiration_page_tags\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`we_meditate_web_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_inspiration_page_tags_order_idx\` ON \`we_meditate_web_settings_inspiration_page_tags\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_inspiration_page_tags_parent_idx\` ON \`we_meditate_web_settings_inspiration_page_tags\` (\`parent_id\`);`)
}
