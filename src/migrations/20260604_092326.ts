import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-d1-sqlite";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // FK-safety (#445, refs #401/#402): D1 does not honor `PRAGMA
  // foreign_keys=OFF` across separate db.run() calls, so the `DROP TABLE
  // meditations` below fires `_meditations_v`'s `parent_id ... ON DELETE set
  // null` cascade and nulls every version row's parent_id. Snapshot the
  // version -> parent mapping first (a plain table, no FK, so the cascade
  // can't touch it) and restore it after both tables are rebuilt.
  await db.run(
    sql`CREATE TABLE \`__mig445_mv_parent\` AS SELECT \`id\`, \`parent_id\` FROM \`_meditations_v\`;`,
  );

  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_meditations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`label\` text,
  	\`locale\` text,
  	\`narrator_id\` integer,
  	\`song_tag_id\` integer,
  	\`duration\` numeric,
  	\`subtle_system_node_weights\` text,
  	\`thumbnail_id\` integer,
  	\`type\` text DEFAULT 'daily',
  	\`frames\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	\`_status\` text DEFAULT 'draft',
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`narrator_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`song_tag_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_meditations\`("id", "label", "locale", "narrator_id", "song_tag_id", "duration", "subtle_system_node_weights", "thumbnail_id", "type", "frames", "updated_at", "created_at", "deleted_at", "_status", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "label", "locale", "narrator_id", "song_tag_id", "duration", "subtle_system_node_weights", "thumbnail_id", "type", "frames", "updated_at", "created_at", "deleted_at", "_status", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditations\`;`,
  );
  await db.run(sql`DROP TABLE \`meditations\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_meditations\` RENAME TO \`meditations\`;`,
  );
  await db.run(sql`PRAGMA foreign_keys=ON;`);
  await db.run(
    sql`CREATE INDEX \`meditations_narrator_idx\` ON \`meditations\` (\`narrator_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations_song_tag_idx\` ON \`meditations\` (\`song_tag_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations_thumbnail_idx\` ON \`meditations\` (\`thumbnail_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations_updated_at_idx\` ON \`meditations\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations_created_at_idx\` ON \`meditations\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations_deleted_at_idx\` ON \`meditations\` (\`deleted_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations__status_idx\` ON \`meditations\` (\`_status\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`meditations_filename_idx\` ON \`meditations\` (\`filename\`);`,
  );
  await db.run(sql`CREATE TABLE \`__new__meditations_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_label\` text,
  	\`version_locale\` text,
  	\`version_narrator_id\` integer,
  	\`version_song_tag_id\` integer,
  	\`version_duration\` numeric,
  	\`version_subtle_system_node_weights\` text,
  	\`version_thumbnail_id\` integer,
  	\`version_type\` text DEFAULT 'daily',
  	\`version_frames\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version_deleted_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`version_thumbnail_u_r_l\` text,
  	\`version_filename\` text,
  	\`version_mime_type\` text,
  	\`version_filesize\` numeric,
  	\`version_width\` numeric,
  	\`version_height\` numeric,
  	\`version_focal_x\` numeric,
  	\`version_focal_y\` numeric,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_narrator_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_song_tag_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new__meditations_v\`("id", "parent_id", "version_label", "version_locale", "version_narrator_id", "version_song_tag_id", "version_duration", "version_subtle_system_node_weights", "version_thumbnail_id", "version_type", "version_frames", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "version_thumbnail_u_r_l", "version_filename", "version_mime_type", "version_filesize", "version_width", "version_height", "version_focal_x", "version_focal_y", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version_label", "version_locale", "version_narrator_id", "version_song_tag_id", "version_duration", "version_subtle_system_node_weights", "version_thumbnail_id", "version_type", "version_frames", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "version_thumbnail_u_r_l", "version_filename", "version_mime_type", "version_filesize", "version_width", "version_height", "version_focal_x", "version_focal_y", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_meditations_v\`;`,
  );
  await db.run(sql`DROP TABLE \`_meditations_v\`;`);
  await db.run(
    sql`ALTER TABLE \`__new__meditations_v\` RENAME TO \`_meditations_v\`;`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_parent_idx\` ON \`_meditations_v\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_narrator_idx\` ON \`_meditations_v\` (\`version_narrator_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_song_tag_idx\` ON \`_meditations_v\` (\`version_song_tag_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_thumbnail_idx\` ON \`_meditations_v\` (\`version_thumbnail_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_updated_at_idx\` ON \`_meditations_v\` (\`version_updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_created_at_idx\` ON \`_meditations_v\` (\`version_created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_deleted_at_idx\` ON \`_meditations_v\` (\`version_deleted_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version__status_idx\` ON \`_meditations_v\` (\`version__status\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_filename_idx\` ON \`_meditations_v\` (\`version_filename\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_created_at_idx\` ON \`_meditations_v\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_updated_at_idx\` ON \`_meditations_v\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_snapshot_idx\` ON \`_meditations_v\` (\`snapshot\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_published_locale_idx\` ON \`_meditations_v\` (\`published_locale\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_latest_idx\` ON \`_meditations_v\` (\`latest\`);`,
  );

  // Restore parent_id values the parent DROP cascade nulled, then drop the
  // snapshot. The rebuild preserved both meditation and version ids, so every
  // saved parent_id still references a live meditations row.
  await db.run(
    sql`UPDATE \`_meditations_v\` SET \`parent_id\` = (SELECT \`parent_id\` FROM \`__mig445_mv_parent\` WHERE \`__mig445_mv_parent\`.\`id\` = \`_meditations_v\`.\`id\`);`,
  );
  await db.run(sql`DROP TABLE \`__mig445_mv_parent\`;`);

  // Data backfill (#445): the `quick` meditation type was retired and folded
  // into `daily`. Convert existing rows (and their version mirror) so no value
  // falls outside the new `daily` | `lesson` union. Not reversed in down() --
  // we can't tell which `daily` rows were originally `quick`.
  await db.run(
    sql`UPDATE \`meditations\` SET \`type\` = 'daily' WHERE \`type\` = 'quick';`,
  );
  await db.run(
    sql`UPDATE \`_meditations_v\` SET \`version_type\` = 'daily' WHERE \`version_type\` = 'quick';`,
  );
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  // Same D1 FK-cascade guard as up(): snapshot version -> parent before the
  // parent rebuild drops `meditations`, restore afterwards. The re-added
  // `title`/`generate_slug`/`slug` columns come back schema-only (NULL) -- the
  // up() dropped that data, and selecting the now-absent columns would hit
  // SQLite's double-quoted-identifier-as-string-literal quirk (all rows get the
  // literal 'slug', breaking the unique index).
  await db.run(
    sql`CREATE TABLE \`__mig445_mv_parent\` AS SELECT \`id\`, \`parent_id\` FROM \`_meditations_v\`;`,
  );

  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_meditations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`label\` text,
  	\`locale\` text,
  	\`narrator_id\` integer,
  	\`song_tag_id\` integer,
  	\`duration\` numeric,
  	\`subtle_system_node_weights\` text,
  	\`title\` text,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text,
  	\`thumbnail_id\` integer,
  	\`type\` text DEFAULT 'quick',
  	\`frames\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	\`_status\` text DEFAULT 'draft',
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`narrator_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`song_tag_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_meditations\`("id", "label", "locale", "narrator_id", "song_tag_id", "duration", "subtle_system_node_weights", "thumbnail_id", "type", "frames", "updated_at", "created_at", "deleted_at", "_status", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "label", "locale", "narrator_id", "song_tag_id", "duration", "subtle_system_node_weights", "thumbnail_id", "type", "frames", "updated_at", "created_at", "deleted_at", "_status", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditations\`;`,
  );
  await db.run(sql`DROP TABLE \`meditations\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_meditations\` RENAME TO \`meditations\`;`,
  );
  await db.run(sql`PRAGMA foreign_keys=ON;`);
  await db.run(
    sql`CREATE INDEX \`meditations_narrator_idx\` ON \`meditations\` (\`narrator_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations_song_tag_idx\` ON \`meditations\` (\`song_tag_id\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`meditations_slug_idx\` ON \`meditations\` (\`slug\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations_thumbnail_idx\` ON \`meditations\` (\`thumbnail_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations_updated_at_idx\` ON \`meditations\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations_created_at_idx\` ON \`meditations\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations_deleted_at_idx\` ON \`meditations\` (\`deleted_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`meditations__status_idx\` ON \`meditations\` (\`_status\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`meditations_filename_idx\` ON \`meditations\` (\`filename\`);`,
  );
  await db.run(sql`CREATE TABLE \`__new__meditations_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_label\` text,
  	\`version_locale\` text,
  	\`version_narrator_id\` integer,
  	\`version_song_tag_id\` integer,
  	\`version_duration\` numeric,
  	\`version_subtle_system_node_weights\` text,
  	\`version_title\` text,
  	\`version_generate_slug\` integer DEFAULT true,
  	\`version_slug\` text,
  	\`version_thumbnail_id\` integer,
  	\`version_type\` text DEFAULT 'quick',
  	\`version_frames\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version_deleted_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`version_thumbnail_u_r_l\` text,
  	\`version_filename\` text,
  	\`version_mime_type\` text,
  	\`version_filesize\` numeric,
  	\`version_width\` numeric,
  	\`version_height\` numeric,
  	\`version_focal_x\` numeric,
  	\`version_focal_y\` numeric,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_narrator_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_song_tag_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new__meditations_v\`("id", "parent_id", "version_label", "version_locale", "version_narrator_id", "version_song_tag_id", "version_duration", "version_subtle_system_node_weights", "version_thumbnail_id", "version_type", "version_frames", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "version_thumbnail_u_r_l", "version_filename", "version_mime_type", "version_filesize", "version_width", "version_height", "version_focal_x", "version_focal_y", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version_label", "version_locale", "version_narrator_id", "version_song_tag_id", "version_duration", "version_subtle_system_node_weights", "version_thumbnail_id", "version_type", "version_frames", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "version_thumbnail_u_r_l", "version_filename", "version_mime_type", "version_filesize", "version_width", "version_height", "version_focal_x", "version_focal_y", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_meditations_v\`;`,
  );
  await db.run(sql`DROP TABLE \`_meditations_v\`;`);
  await db.run(
    sql`ALTER TABLE \`__new__meditations_v\` RENAME TO \`_meditations_v\`;`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_parent_idx\` ON \`_meditations_v\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_narrator_idx\` ON \`_meditations_v\` (\`version_narrator_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_song_tag_idx\` ON \`_meditations_v\` (\`version_song_tag_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_slug_idx\` ON \`_meditations_v\` (\`version_slug\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_thumbnail_idx\` ON \`_meditations_v\` (\`version_thumbnail_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_updated_at_idx\` ON \`_meditations_v\` (\`version_updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_created_at_idx\` ON \`_meditations_v\` (\`version_created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_deleted_at_idx\` ON \`_meditations_v\` (\`version_deleted_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version__status_idx\` ON \`_meditations_v\` (\`version__status\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_version_version_filename_idx\` ON \`_meditations_v\` (\`version_filename\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_created_at_idx\` ON \`_meditations_v\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_updated_at_idx\` ON \`_meditations_v\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_snapshot_idx\` ON \`_meditations_v\` (\`snapshot\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_published_locale_idx\` ON \`_meditations_v\` (\`published_locale\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_meditations_v_latest_idx\` ON \`_meditations_v\` (\`latest\`);`,
  );

  // Restore parent_id values the parent DROP cascade nulled, then drop the snapshot.
  await db.run(
    sql`UPDATE \`_meditations_v\` SET \`parent_id\` = (SELECT \`parent_id\` FROM \`__mig445_mv_parent\` WHERE \`__mig445_mv_parent\`.\`id\` = \`_meditations_v\`.\`id\`);`,
  );
  await db.run(sql`DROP TABLE \`__mig445_mv_parent\`;`);
}
