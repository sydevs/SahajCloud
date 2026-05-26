import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lectures\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`type\` text DEFAULT 'full' NOT NULL,
  	\`nirmal_vidya_vimeo_url\` text,
  	\`thumbnail_id\` integer,
  	\`start_time\` numeric,
  	\`stop_time\` numeric,
  	\`metadata\` text,
  	\`full_lecture_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`full_lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  // Existing rows are all full lectures (`type` defaults to 'full'); the old
  // `end_time` column is preserved as the new `stop_time` (#338 rename).
  await db.run(sql`INSERT INTO \`__new_lectures\`("id", "nirmal_vidya_vimeo_url", "thumbnail_id", "start_time", "stop_time", "metadata", "full_lecture_id", "updated_at", "created_at") SELECT "id", "nirmal_vidya_vimeo_url", "thumbnail_id", "start_time", "end_time", "metadata", "full_lecture_id", "updated_at", "created_at" FROM \`lectures\`;`)
  await db.run(sql`DROP TABLE \`lectures\`;`)
  await db.run(sql`ALTER TABLE \`__new_lectures\` RENAME TO \`lectures\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`lectures_nirmal_vidya_vimeo_url_idx\` ON \`lectures\` (\`nirmal_vidya_vimeo_url\`);`)
  await db.run(sql`CREATE INDEX \`lectures_thumbnail_idx\` ON \`lectures\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_full_lecture_idx\` ON \`lectures\` (\`full_lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_updated_at_idx\` ON \`lectures\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lectures_created_at_idx\` ON \`lectures\` (\`created_at\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lectures\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nirmal_vidya_vimeo_url\` text NOT NULL,
  	\`thumbnail_id\` integer,
  	\`metadata\` text,
  	\`start_time\` numeric,
  	\`end_time\` numeric,
  	\`full_lecture_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`full_lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  // Roll back: read `stop_time` (current schema) and write back into `end_time`.
  await db.run(sql`INSERT INTO \`__new_lectures\`("id", "nirmal_vidya_vimeo_url", "thumbnail_id", "metadata", "start_time", "end_time", "full_lecture_id", "updated_at", "created_at") SELECT "id", "nirmal_vidya_vimeo_url", "thumbnail_id", "metadata", "start_time", "stop_time", "full_lecture_id", "updated_at", "created_at" FROM \`lectures\`;`)
  await db.run(sql`DROP TABLE \`lectures\`;`)
  await db.run(sql`ALTER TABLE \`__new_lectures\` RENAME TO \`lectures\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`lectures_nirmal_vidya_vimeo_url_idx\` ON \`lectures\` (\`nirmal_vidya_vimeo_url\`);`)
  await db.run(sql`CREATE INDEX \`lectures_thumbnail_idx\` ON \`lectures\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_full_lecture_idx\` ON \`lectures\` (\`full_lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_updated_at_idx\` ON \`lectures\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lectures_created_at_idx\` ON \`lectures\` (\`created_at\`);`)
}
