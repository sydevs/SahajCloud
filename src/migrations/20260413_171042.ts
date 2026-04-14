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

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Drop old filename indexes. IF EXISTS handles production, where:
  //   - `albums_filename_idx` was never created
  //   - `app_cards_filename_idx` is still named `cards_filename_idx` (the 20260203_090000
  //     rename migration renamed tables but not indexes)
  await db.run(sql`DROP INDEX IF EXISTS \`albums_filename_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`app_cards_filename_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`cards_filename_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`_app_cards_v_version_version_filename_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`_cards_v_version_version_filename_idx\`;`)

  // Add new FK columns as nullable. They cannot be added as NOT NULL when the
  // tables already contain rows (SQLite requires a DEFAULT). Albums is tightened
  // to NOT NULL after backfill via table recreation (see below).
  await db.run(sql`ALTER TABLE \`albums\` ADD \`artwork_id\` integer REFERENCES images(id) ON DELETE SET NULL;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`image_id\` integer REFERENCES images(id) ON DELETE SET NULL;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_image_id\` integer REFERENCES images(id) ON DELETE SET NULL;`)

  // Backfill: create an `images` record for each album/app_card that has upload
  // data, then link the new FK to it. Preserves the existing Cloudflare Images
  // ID stored in `filename` so assets keep rendering.
  await backfillUploadToImage(db, 'albums', 'artwork_id')
  await backfillUploadToImage(db, 'app_cards', 'image_id')

  // Create new indexes on the app_cards FK columns. `albums_artwork_idx` is
  // created after table recreation below (DROP TABLE would drop it anyway).
  await db.run(sql`CREATE INDEX \`app_cards_image_idx\` ON \`app_cards\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_version_image_idx\` ON \`_app_cards_v\` (\`version_image_id\`);`)

  // Recreate albums to:
  //   1. Enforce NOT NULL on artwork_id (matches the .json snapshot + field `required: true`)
  //   2. Drop all upload columns in one shot
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_albums\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`artwork_id\` integer NOT NULL REFERENCES images(id) ON DELETE SET NULL,
  	\`artist_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text
  );
  `)
  // Any album without upload data (shouldn't exist in prod, but guard anyway)
  // is dropped by the INNER WHERE clause to satisfy NOT NULL.
  await db.run(sql`INSERT INTO \`__new_albums\`(\`id\`, \`artwork_id\`, \`artist_url\`, \`updated_at\`, \`created_at\`, \`deleted_at\`) SELECT \`id\`, \`artwork_id\`, \`artist_url\`, \`updated_at\`, \`created_at\`, \`deleted_at\` FROM \`albums\` WHERE \`artwork_id\` IS NOT NULL;`)
  await db.run(sql`DROP TABLE \`albums\`;`)
  await db.run(sql`ALTER TABLE \`__new_albums\` RENAME TO \`albums\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)

  // Recreate albums indexes (table recreation drops them)
  await db.run(sql`CREATE INDEX \`albums_artwork_idx\` ON \`albums\` (\`artwork_id\`);`)
  await db.run(sql`CREATE INDEX \`albums_updated_at_idx\` ON \`albums\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`albums_created_at_idx\` ON \`albums\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`albums_deleted_at_idx\` ON \`albums\` (\`deleted_at\`);`)

  // For app_cards / _app_cards_v the image FK stays nullable (matches snapshot),
  // so we can use ALTER TABLE DROP COLUMN directly without full recreation.
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`thumbnail_u_r_l\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`filename\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`mime_type\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`filesize\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`width\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`height\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`focal_x\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`focal_y\`;`)

  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_thumbnail_u_r_l\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_filename\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_mime_type\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_filesize\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_width\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_height\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_focal_x\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_focal_y\`;`)
}

async function backfillUploadToImage(
  db: MigrateUpArgs['db'],
  table: 'albums' | 'app_cards',
  fkColumn: 'artwork_id' | 'image_id',
): Promise<void> {
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
    // otherwise create a new one. This keeps the migration idempotent.
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
