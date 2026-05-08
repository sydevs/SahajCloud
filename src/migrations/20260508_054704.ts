import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`audiences_country\` RENAME TO \`audiences_location_countries\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_audiences_location_countries\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_audiences_location_countries\`("order", "parent_id", "value", "id") SELECT "order", "parent_id", "value", "id" FROM \`audiences_location_countries\`;`)
  await db.run(sql`DROP TABLE \`audiences_location_countries\`;`)
  await db.run(sql`ALTER TABLE \`__new_audiences_location_countries\` RENAME TO \`audiences_location_countries\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`audiences_location_countries_order_idx\` ON \`audiences_location_countries\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`audiences_location_countries_parent_idx\` ON \`audiences_location_countries\` (\`parent_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`audiences_location_countries\` RENAME TO \`audiences_country\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_audiences_country\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_audiences_country\`("order", "parent_id", "value", "id") SELECT "order", "parent_id", "value", "id" FROM \`audiences_country\`;`)
  await db.run(sql`DROP TABLE \`audiences_country\`;`)
  await db.run(sql`ALTER TABLE \`__new_audiences_country\` RENAME TO \`audiences_country\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`audiences_country_order_idx\` ON \`audiences_country\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`audiences_country_parent_idx\` ON \`audiences_country\` (\`parent_id\`);`)
}
