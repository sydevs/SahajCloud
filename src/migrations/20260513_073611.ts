import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`videos\` ADD \`thumbnail_id\` integer REFERENCES images(id);`)
  await db.run(sql`CREATE INDEX \`videos_thumbnail_idx\` ON \`videos\` (\`thumbnail_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_videos\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`subtitles\` text,
  	\`tags\` text NOT NULL,
  	\`file_metadata\` text DEFAULT '{}',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric
  );
  `)
  await db.run(sql`INSERT INTO \`__new_videos\`("id", "subtitles", "tags", "file_metadata", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "subtitles", "tags", "file_metadata", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`videos\`;`)
  await db.run(sql`DROP TABLE \`videos\`;`)
  await db.run(sql`ALTER TABLE \`__new_videos\` RENAME TO \`videos\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`videos_updated_at_idx\` ON \`videos\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`videos_created_at_idx\` ON \`videos\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`videos_filename_idx\` ON \`videos\` (\`filename\`);`)
}
