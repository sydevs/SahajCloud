import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

type UploadRow = {
  id: number
  filename: string | null
  mime_type: string | null
  filesize: number | null
  width: number | null
  height: number | null
  focal_x: number | null
  focal_y: number | null
  thumbnail_u_r_l: string | null
}

type InsertedId = { id: number }

type ColumnInfo = { name: string }

async function columnExists(
  db: MigrateUpArgs['db'],
  table: string,
  column: string,
): Promise<boolean> {
  // PRAGMA table_info can't use bound params, so inject the validated identifier.
  const rows = await db.all<ColumnInfo>(sql.raw(`PRAGMA table_info(\`${table}\`)`))
  return rows.some((r) => r.name === column)
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Clean up any leftover recreation table from a prior failed run of this migration.
  // The previous `up()` attempted to recreate `albums` with NOT NULL `artwork_id` but
  // failed at `DROP TABLE albums` because `songs.album_id` is NOT NULL with
  // `ON DELETE SET NULL` — which fires on DROP even with `PRAGMA foreign_keys=OFF`
  // (D1 wraps each statement in an implicit transaction, making the PRAGMA a no-op).
  // We now accept `artwork_id` as nullable at the DB level; API-level `required: true`
  // on the Albums.artwork field still enforces it.
  await db.run(sql`DROP TABLE IF EXISTS \`__new_albums\`;`)

  // Drop old filename indexes. IF EXISTS handles both fresh envs and production, where:
  //   - `albums_filename_idx` was never created
  //   - `app_cards_filename_idx` is still named `cards_filename_idx` (the 20260203_090000
  //     rename migration renamed tables but not indexes)
  await db.run(sql`DROP INDEX IF EXISTS \`albums_filename_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`app_cards_filename_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`cards_filename_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`_app_cards_v_version_version_filename_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`_cards_v_version_version_filename_idx\`;`)

  // Add new FK columns as nullable (idempotent — skip if a prior failed run added them).
  // Cannot be NOT NULL because SQLite rejects `ALTER TABLE ADD NOT NULL` on non-empty
  // tables without a DEFAULT, and we can't recreate the albums table in D1 (see above).
  if (!(await columnExists(db, 'albums', 'artwork_id'))) {
    await db.run(sql`ALTER TABLE \`albums\` ADD \`artwork_id\` integer REFERENCES images(id) ON DELETE SET NULL;`)
  }
  if (!(await columnExists(db, 'app_cards', 'image_id'))) {
    await db.run(sql`ALTER TABLE \`app_cards\` ADD \`image_id\` integer REFERENCES images(id) ON DELETE SET NULL;`)
  }
  if (!(await columnExists(db, '_app_cards_v', 'version_image_id'))) {
    await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_image_id\` integer REFERENCES images(id) ON DELETE SET NULL;`)
  }

  // Backfill: create an `images` record for each album/app_card that has upload data,
  // then link the new FK to it. Preserves the existing Cloudflare Images ID stored in
  // `filename` so assets keep rendering. Idempotent via the WHERE clause.
  await backfillUploadToImage(db, 'albums')
  await backfillUploadToImage(db, 'app_cards')

  // Create new indexes on the FK columns. IF NOT EXISTS for idempotency.
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`albums_artwork_idx\` ON \`albums\` (\`artwork_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`app_cards_image_idx\` ON \`app_cards\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`_app_cards_v_version_version_image_idx\` ON \`_app_cards_v\` (\`version_image_id\`);`)

  // Drop upload columns from all three tables. Guarded by columnExists for idempotency.
  await dropUploadColumns(db, 'albums', '')
  await dropUploadColumns(db, 'app_cards', '')
  await dropUploadColumns(db, '_app_cards_v', 'version_')
}

async function backfillUploadToImage(
  db: MigrateUpArgs['db'],
  table: 'albums' | 'app_cards',
): Promise<void> {
  // If the upload columns were already dropped on a prior partial run, there's nothing to backfill.
  if (!(await columnExists(db, table, 'filename'))) {
    return
  }

  const rows =
    table === 'albums'
      ? await db.all<UploadRow>(sql`
          SELECT id, filename, mime_type, filesize, width, height, focal_x, focal_y, thumbnail_u_r_l
          FROM albums
          WHERE filename IS NOT NULL AND artwork_id IS NULL
        `)
      : await db.all<UploadRow>(sql`
          SELECT id, filename, mime_type, filesize, width, height, focal_x, focal_y, thumbnail_u_r_l
          FROM app_cards
          WHERE filename IS NOT NULL AND image_id IS NULL
        `)

  for (const row of rows) {
    // Reuse an existing image row if one already points at the same CF Images ID,
    // otherwise create a new one. Keeps the migration idempotent across retries.
    const existing = await db.all<InsertedId>(sql`
      SELECT id FROM images WHERE filename = ${row.filename} LIMIT 1
    `)

    let imageId: number
    if (existing.length > 0 && existing[0]) {
      imageId = existing[0].id
    } else {
      const inserted = await db.all<InsertedId>(sql`
        INSERT INTO images (filename, mime_type, filesize, width, height, focal_x, focal_y, thumbnail_u_r_l)
        VALUES (${row.filename}, ${row.mime_type}, ${row.filesize}, ${row.width}, ${row.height}, ${row.focal_x}, ${row.focal_y}, ${row.thumbnail_u_r_l})
        RETURNING id
      `)
      const inserted0 = inserted[0]
      if (!inserted0) continue
      imageId = inserted0.id

      // images_locales.alt is NOT NULL — use the filename as a placeholder so
      // admins can edit it later without the row being invalid.
      await db.run(sql`
        INSERT INTO images_locales (alt, _locale, _parent_id)
        VALUES (${row.filename ?? ''}, 'en', ${imageId})
      `)
    }

    if (table === 'albums') {
      await db.run(sql`UPDATE albums SET artwork_id = ${imageId} WHERE id = ${row.id}`)
    } else {
      await db.run(sql`UPDATE app_cards SET image_id = ${imageId} WHERE id = ${row.id}`)
    }
  }
}

async function dropUploadColumns(
  db: MigrateUpArgs['db'],
  table: string,
  prefix: '' | 'version_',
): Promise<void> {
  const columns = [
    'thumbnail_u_r_l',
    'filename',
    'mime_type',
    'filesize',
    'width',
    'height',
    'focal_x',
    'focal_y',
  ]

  for (const base of columns) {
    const column = `${prefix}${base}`
    if (await columnExists(db, table, column)) {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\`;`))
    }
  }
}

// Down migration assumes the full up() ran. It restores the original upload-based
// schema and loses the artwork_id / image_id linkages. Rarely used in D1 production
// (rollbacks are not a standard part of the deploy flow) but kept for completeness.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_albums\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`artist_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
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
  await db.run(sql`INSERT INTO \`__new_albums\`("id", "artist_url", "updated_at", "created_at", "deleted_at") SELECT "id", "artist_url", "updated_at", "created_at", "deleted_at" FROM \`albums\`;`)
  await db.run(sql`DROP TABLE \`albums\`;`)
  await db.run(sql`ALTER TABLE \`__new_albums\` RENAME TO \`albums\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`albums_updated_at_idx\` ON \`albums\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`albums_created_at_idx\` ON \`albums\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`albums_deleted_at_idx\` ON \`albums\` (\`deleted_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`albums_filename_idx\` ON \`albums\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_app_cards\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`type\` text DEFAULT 'app-page',
  	\`app_page\` text,
  	\`countdown\` integer DEFAULT false,
  	\`schedule_first_date\` text,
  	\`schedule_firstdate_tz\` text,
  	\`schedule_recurrence_type\` text,
  	\`schedule_interval\` numeric DEFAULT 1,
  	\`rules\` text,
  	\`weight\` numeric DEFAULT 3,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
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
  await db.run(sql`INSERT INTO \`__new_app_cards\`("id", "type", "app_page", "countdown", "schedule_first_date", "schedule_firstdate_tz", "schedule_recurrence_type", "schedule_interval", "rules", "weight", "updated_at", "created_at", "_status") SELECT "id", "type", "app_page", "countdown", "schedule_first_date", "schedule_firstdate_tz", "schedule_recurrence_type", "schedule_interval", "rules", "weight", "updated_at", "created_at", "_status" FROM \`app_cards\`;`)
  await db.run(sql`DROP TABLE \`app_cards\`;`)
  await db.run(sql`ALTER TABLE \`__new_app_cards\` RENAME TO \`app_cards\`;`)
  await db.run(sql`CREATE INDEX \`app_cards_updated_at_idx\` ON \`app_cards\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_created_at_idx\` ON \`app_cards\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`app_cards__status_idx\` ON \`app_cards\` (\`_status\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`app_cards_filename_idx\` ON \`app_cards\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new__app_cards_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_type\` text DEFAULT 'app-page',
  	\`version_app_page\` text,
  	\`version_countdown\` integer DEFAULT false,
  	\`version_schedule_first_date\` text,
  	\`version_schedule_firstdate_tz\` text,
  	\`version_schedule_recurrence_type\` text,
  	\`version_schedule_interval\` numeric DEFAULT 1,
  	\`version_rules\` text,
  	\`version_weight\` numeric DEFAULT 3,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
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
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__app_cards_v\`("id", "parent_id", "version_type", "version_app_page", "version_countdown", "version_schedule_first_date", "version_schedule_firstdate_tz", "version_schedule_recurrence_type", "version_schedule_interval", "version_rules", "version_weight", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version_type", "version_app_page", "version_countdown", "version_schedule_first_date", "version_schedule_firstdate_tz", "version_schedule_recurrence_type", "version_schedule_interval", "version_rules", "version_weight", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_app_cards_v\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__app_cards_v\` RENAME TO \`_app_cards_v\`;`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_parent_idx\` ON \`_app_cards_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_updated_at_idx\` ON \`_app_cards_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_created_at_idx\` ON \`_app_cards_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version__status_idx\` ON \`_app_cards_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_filename_idx\` ON \`_app_cards_v\` (\`version_filename\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_created_at_idx\` ON \`_app_cards_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_updated_at_idx\` ON \`_app_cards_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_snapshot_idx\` ON \`_app_cards_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_published_locale_idx\` ON \`_app_cards_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_latest_idx\` ON \`_app_cards_v\` (\`latest\`);`)
}
