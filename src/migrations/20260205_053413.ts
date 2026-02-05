import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
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
  await db.run(sql`ALTER TABLE \`meditation_tags\` ADD \`is_featured\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`meditation_tags\` ADD \`is_parent\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`meditation_tags\` DROP COLUMN \`meditation_type\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`meditation_tags_breadcrumbs\`;`)
  await db.run(sql`ALTER TABLE \`meditation_tags\` ADD \`meditation_type\` text;`)
  await db.run(sql`ALTER TABLE \`meditation_tags\` DROP COLUMN \`is_featured\`;`)
  await db.run(sql`ALTER TABLE \`meditation_tags\` DROP COLUMN \`is_parent\`;`)
}
