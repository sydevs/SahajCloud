import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`app_cards_schedule_exclusions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`start_date\` text,
  	\`end_date\` text,
  	\`reason\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`app_cards_schedule_exclusions_order_idx\` ON \`app_cards_schedule_exclusions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_schedule_exclusions_parent_id_idx\` ON \`app_cards_schedule_exclusions\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_app_cards_v_version_schedule_exclusions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`start_date\` text,
  	\`end_date\` text,
  	\`reason\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_app_cards_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_schedule_exclusions_order_idx\` ON \`_app_cards_v_version_schedule_exclusions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_schedule_exclusions_parent_id_idx\` ON \`_app_cards_v_version_schedule_exclusions\` (\`_parent_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`app_cards_schedule_exclusions\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v_version_schedule_exclusions\`;`)
}
