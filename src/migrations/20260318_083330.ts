import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`app_cards_schedule_weekdays\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`app_cards_schedule_weekdays_order_idx\` ON \`app_cards_schedule_weekdays\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_schedule_weekdays_parent_idx\` ON \`app_cards_schedule_weekdays\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_app_cards_v_version_schedule_weekdays\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_app_cards_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_schedule_weekdays_order_idx\` ON \`_app_cards_v_version_schedule_weekdays\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_schedule_weekdays_parent_idx\` ON \`_app_cards_v_version_schedule_weekdays\` (\`parent_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`app_cards_schedule_weekdays\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v_version_schedule_weekdays\`;`)
}
