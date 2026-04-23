import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lecture_clips\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`lecture_id\` integer NOT NULL,
  	\`start_time\` numeric DEFAULT 0 NOT NULL,
  	\`end_time\` numeric DEFAULT 600 NOT NULL,
  	\`thumbnail_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lecture_clips\`("id", "lecture_id", "start_time", "end_time", "thumbnail_id", "updated_at", "created_at") SELECT "id", "parent_id", "start_time", "end_time", "thumbnail_id", "updated_at", "created_at" FROM \`lecture_clips\`;`)
  await db.run(sql`DROP TABLE \`lecture_clips\`;`)
  await db.run(sql`ALTER TABLE \`__new_lecture_clips\` RENAME TO \`lecture_clips\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`lecture_clips_lecture_idx\` ON \`lecture_clips\` (\`lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_thumbnail_idx\` ON \`lecture_clips\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_updated_at_idx\` ON \`lecture_clips\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_created_at_idx\` ON \`lecture_clips\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`app_cards_rels\` ADD \`lectures_id\` integer REFERENCES lectures(id);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_lectures_id_idx\` ON \`app_cards_rels\` (\`lectures_id\`);`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_rels\` ADD \`lectures_id\` integer REFERENCES lectures(id);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_lectures_id_idx\` ON \`_app_cards_v_rels\` (\`lectures_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lecture_clips\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`start_time\` numeric DEFAULT 0 NOT NULL,
  	\`end_time\` numeric DEFAULT 600 NOT NULL,
  	\`thumbnail_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lecture_clips\`("id", "parent_id", "start_time", "end_time", "thumbnail_id", "updated_at", "created_at") SELECT "id", "lecture_id", "start_time", "end_time", "thumbnail_id", "updated_at", "created_at" FROM \`lecture_clips\`;`)
  await db.run(sql`DROP TABLE \`lecture_clips\`;`)
  await db.run(sql`ALTER TABLE \`__new_lecture_clips\` RENAME TO \`lecture_clips\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`lecture_clips_parent_idx\` ON \`lecture_clips\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_thumbnail_idx\` ON \`lecture_clips\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_updated_at_idx\` ON \`lecture_clips\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_created_at_idx\` ON \`lecture_clips\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_app_cards_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lecture_clips_id\` integer,
  	\`albums_id\` integer,
  	\`meditations_id\` integer,
  	\`audiences_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lecture_clips_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_app_cards_rels\`("id", "order", "parent_id", "path", "lecture_clips_id", "albums_id", "meditations_id", "audiences_id") SELECT "id", "order", "parent_id", "path", "lecture_clips_id", "albums_id", "meditations_id", "audiences_id" FROM \`app_cards_rels\`;`)
  await db.run(sql`DROP TABLE \`app_cards_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_app_cards_rels\` RENAME TO \`app_cards_rels\`;`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_order_idx\` ON \`app_cards_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_parent_idx\` ON \`app_cards_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_path_idx\` ON \`app_cards_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_lecture_clips_id_idx\` ON \`app_cards_rels\` (\`lecture_clips_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_albums_id_idx\` ON \`app_cards_rels\` (\`albums_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_meditations_id_idx\` ON \`app_cards_rels\` (\`meditations_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_audiences_id_idx\` ON \`app_cards_rels\` (\`audiences_id\`);`)
  await db.run(sql`CREATE TABLE \`__new__app_cards_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lecture_clips_id\` integer,
  	\`albums_id\` integer,
  	\`meditations_id\` integer,
  	\`audiences_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_app_cards_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lecture_clips_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new__app_cards_v_rels\`("id", "order", "parent_id", "path", "lecture_clips_id", "albums_id", "meditations_id", "audiences_id") SELECT "id", "order", "parent_id", "path", "lecture_clips_id", "albums_id", "meditations_id", "audiences_id" FROM \`_app_cards_v_rels\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new__app_cards_v_rels\` RENAME TO \`_app_cards_v_rels\`;`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_order_idx\` ON \`_app_cards_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_parent_idx\` ON \`_app_cards_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_path_idx\` ON \`_app_cards_v_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_lecture_clips_id_idx\` ON \`_app_cards_v_rels\` (\`lecture_clips_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_albums_id_idx\` ON \`_app_cards_v_rels\` (\`albums_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_meditations_id_idx\` ON \`_app_cards_v_rels\` (\`meditations_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_audiences_id_idx\` ON \`_app_cards_v_rels\` (\`audiences_id\`);`)
}
