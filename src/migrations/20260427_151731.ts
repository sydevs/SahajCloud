import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`meditation_tags_timings\` RENAME TO \`user_choices_timings\`;`)
  await db.run(sql`ALTER TABLE \`meditation_tags\` RENAME TO \`user_choices\`;`)
  await db.run(sql`ALTER TABLE \`meditation_tags_locales\` RENAME TO \`user_choices_locales\`;`)
  await db.run(sql`CREATE TABLE \`subtle_system_nodes\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`page_id\` integer NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`subtle_system_nodes_slug_idx\` ON \`subtle_system_nodes\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`subtle_system_nodes_page_idx\` ON \`subtle_system_nodes\` (\`page_id\`);`)
  await db.run(sql`CREATE INDEX \`subtle_system_nodes_updated_at_idx\` ON \`subtle_system_nodes\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`subtle_system_nodes_created_at_idx\` ON \`subtle_system_nodes\` (\`created_at\`);`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_user_choices_timings\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`user_choices\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_user_choices_timings\`("order", "parent_id", "value", "id") SELECT "order", "parent_id", "value", "id" FROM \`user_choices_timings\`;`)
  await db.run(sql`DROP TABLE \`user_choices_timings\`;`)
  await db.run(sql`ALTER TABLE \`__new_user_choices_timings\` RENAME TO \`user_choices_timings\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`user_choices_timings_order_idx\` ON \`user_choices_timings\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`user_choices_timings_parent_idx\` ON \`user_choices_timings\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_user_choices\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text NOT NULL,
  	\`type\` text DEFAULT 'mood' NOT NULL,
  	\`color\` text DEFAULT '#000000',
  	\`parent_id\` integer,
  	\`is_featured\` integer DEFAULT false,
  	\`order\` numeric DEFAULT 1,
  	\`is_parent\` integer DEFAULT false NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`user_choices\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  // Drizzle generated this INSERT/SELECT with `type` listed on both sides, but the
  // source `user_choices` (renamed from meditation_tags) has no `type` column yet.
  // Drop it from both sides — the column-level `DEFAULT 'mood'` on __new_user_choices
  // backfills every row to 'mood' (the contract for pre-existing user-state rows).
  await db.run(sql`INSERT INTO \`__new_user_choices\`("id", "generate_slug", "slug", "color", "parent_id", "is_featured", "order", "is_parent", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "generate_slug", "slug", "color", "parent_id", "is_featured", "order", "is_parent", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`user_choices\`;`)
  await db.run(sql`DROP TABLE \`user_choices\`;`)
  await db.run(sql`ALTER TABLE \`__new_user_choices\` RENAME TO \`user_choices\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`user_choices_slug_idx\` ON \`user_choices\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`user_choices_parent_idx\` ON \`user_choices\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`user_choices_is_parent_idx\` ON \`user_choices\` (\`is_parent\`);`)
  await db.run(sql`CREATE INDEX \`user_choices_updated_at_idx\` ON \`user_choices\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`user_choices_created_at_idx\` ON \`user_choices\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`user_choices_filename_idx\` ON \`user_choices\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_user_choices_locales\` (
  	\`title\` text,
  	\`morning_meditation_id\` integer,
  	\`afternoon_meditation_id\` integer,
  	\`evening_meditation_id\` integer,
  	\`night_meditation_id\` integer,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`morning_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`afternoon_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`evening_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`night_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`user_choices\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_user_choices_locales\`("title", "morning_meditation_id", "afternoon_meditation_id", "evening_meditation_id", "night_meditation_id", "id", "_locale", "_parent_id") SELECT "title", "morning_meditation_id", "afternoon_meditation_id", "evening_meditation_id", "night_meditation_id", "id", "_locale", "_parent_id" FROM \`user_choices_locales\`;`)
  await db.run(sql`DROP TABLE \`user_choices_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_user_choices_locales\` RENAME TO \`user_choices_locales\`;`)
  await db.run(sql`CREATE INDEX \`user_choices_morning_meditation_idx\` ON \`user_choices_locales\` (\`morning_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`user_choices_afternoon_meditation_idx\` ON \`user_choices_locales\` (\`afternoon_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`user_choices_evening_meditation_idx\` ON \`user_choices_locales\` (\`evening_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`user_choices_night_meditation_idx\` ON \`user_choices_locales\` (\`night_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`user_choices_locales_locale_parent_id_unique\` ON \`user_choices_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`pages_id\` integer,
  	\`meditations_id\` integer,
  	\`songs_id\` integer,
  	\`albums_id\` integer,
  	\`videos_id\` integer,
  	\`lessons_id\` integer,
  	\`lectures_id\` integer,
  	\`lecture_clips_id\` integer,
  	\`frames_id\` integer,
  	\`narrators_id\` integer,
  	\`authors_id\` integer,
  	\`images_id\` integer,
  	\`files_id\` integer,
  	\`audiences_id\` integer,
  	\`user_choices_id\` integer,
  	\`subtle_system_nodes_id\` integer,
  	\`song_tags_id\` integer,
  	\`managers_id\` integer,
  	\`clients_id\` integer,
  	\`app_cards_id\` integer,
  	\`forms_id\` integer,
  	\`form_submissions_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`songs_id\`) REFERENCES \`songs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`videos_id\`) REFERENCES \`videos\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lessons_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lectures_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lecture_clips_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`frames_id\`) REFERENCES \`frames\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`narrators_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`authors_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`images_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`files_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`user_choices_id\`) REFERENCES \`user_choices\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`subtle_system_nodes_id\`) REFERENCES \`subtle_system_nodes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`song_tags_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`managers_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`clients_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`app_cards_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`forms_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`form_submissions_id\`) REFERENCES \`form_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  // Polymorphic-FK rebuild fix: the source `payload_locked_documents_rels` has
  // `meditation_tags_id` (the old name) and no `subtle_system_nodes_id`. Map the
  // legacy column into the new `user_choices_id` slot to preserve doc locks for
  // user choices, and omit `subtle_system_nodes_id` from the copy — NULL is fine
  // for pre-existing rows since the collection is brand new.
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "pages_id", "meditations_id", "songs_id", "albums_id", "videos_id", "lessons_id", "lectures_id", "lecture_clips_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "audiences_id", "user_choices_id", "song_tags_id", "managers_id", "clients_id", "app_cards_id", "forms_id", "form_submissions_id") SELECT "id", "order", "parent_id", "path", "pages_id", "meditations_id", "songs_id", "albums_id", "videos_id", "lessons_id", "lectures_id", "lecture_clips_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "audiences_id", "meditation_tags_id", "song_tags_id", "managers_id", "clients_id", "app_cards_id", "forms_id", "form_submissions_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_meditations_id_idx\` ON \`payload_locked_documents_rels\` (\`meditations_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_songs_id_idx\` ON \`payload_locked_documents_rels\` (\`songs_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_albums_id_idx\` ON \`payload_locked_documents_rels\` (\`albums_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_videos_id_idx\` ON \`payload_locked_documents_rels\` (\`videos_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lessons_id_idx\` ON \`payload_locked_documents_rels\` (\`lessons_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lectures_id_idx\` ON \`payload_locked_documents_rels\` (\`lectures_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lecture_clips_id_idx\` ON \`payload_locked_documents_rels\` (\`lecture_clips_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_frames_id_idx\` ON \`payload_locked_documents_rels\` (\`frames_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_narrators_id_idx\` ON \`payload_locked_documents_rels\` (\`narrators_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_authors_id_idx\` ON \`payload_locked_documents_rels\` (\`authors_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_images_id_idx\` ON \`payload_locked_documents_rels\` (\`images_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_files_id_idx\` ON \`payload_locked_documents_rels\` (\`files_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_audiences_id_idx\` ON \`payload_locked_documents_rels\` (\`audiences_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_user_choices_id_idx\` ON \`payload_locked_documents_rels\` (\`user_choices_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_subtle_system_nodes_id_idx\` ON \`payload_locked_documents_rels\` (\`subtle_system_nodes_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_song_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`song_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_managers_id_idx\` ON \`payload_locked_documents_rels\` (\`managers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_clients_id_idx\` ON \`payload_locked_documents_rels\` (\`clients_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_app_cards_id_idx\` ON \`payload_locked_documents_rels\` (\`app_cards_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_forms_id_idx\` ON \`payload_locked_documents_rels\` (\`forms_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_form_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`form_submissions_id\`);`)
  await db.run(sql`ALTER TABLE \`lectures_rels\` ADD \`user_choices_id\` integer REFERENCES user_choices(id);`)
  await db.run(sql`ALTER TABLE \`lectures_rels\` ADD \`subtle_system_nodes_id\` integer REFERENCES subtle_system_nodes(id);`)
  await db.run(sql`CREATE INDEX \`lectures_rels_user_choices_id_idx\` ON \`lectures_rels\` (\`user_choices_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_rels_subtle_system_nodes_id_idx\` ON \`lectures_rels\` (\`subtle_system_nodes_id\`);`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`subtle_system_node_id\` integer REFERENCES subtle_system_nodes(id);`)
  await db.run(sql`CREATE INDEX \`frames_subtle_system_node_idx\` ON \`frames\` (\`subtle_system_node_id\`);`)

  // ============================================================================
  // DATA BACKFILL — seed SubtleSystemNodes (12 rows + placeholder Pages),
  // then map Frames.category onto the new relationship + tag values.
  // Augmentation per issue #310 spec; ticket explicitly opted into in-migration
  // backfill instead of a post-deploy sync.
  // ============================================================================

  // --- Seed the 12 SubtleSystemNode rows --------------------------------------
  // For each slug: attach to an existing Page if one matches, otherwise create
  // a published placeholder Page so the required `page` relationship is satisfied.
  const NODE_OPTIONS = [
    { slug: 'mooladhara', label: 'Mooladhara' },
    { slug: 'swadhistan', label: 'Swadhistan' },
    { slug: 'nabhi', label: 'Nabhi' },
    { slug: 'void', label: 'Void' },
    { slug: 'anahat', label: 'Anahat' },
    { slug: 'vishuddhi', label: 'Vishuddhi' },
    { slug: 'agnya', label: 'Agnya' },
    { slug: 'sahasrara', label: 'Sahasrara' },
    { slug: 'kundalini', label: 'Kundalini' },
    { slug: 'pingala', label: 'Left Channel' },
    { slug: 'ida', label: 'Right Channel' },
    { slug: 'sushumna', label: 'Center Channel' },
  ] as const

  const placeholderContent = {
    root: {
      type: 'root',
      children: [
        { type: 'paragraph', version: 1, children: [], format: '', indent: 0, direction: null },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  }

  for (const node of NODE_OPTIONS) {
    const existing = await payload.find({
      collection: 'pages',
      where: { slug: { equals: node.slug } },
      limit: 1,
      depth: 0,
      draft: true,
      req,
    })
    let pageId: number = existing.docs[0]?.id as number
    if (!pageId) {
      const created = await payload.create({
        collection: 'pages',
        data: {
          title: node.label,
          slug: node.slug,
          content: placeholderContent,
          _status: 'published',
        },
        req,
      })
      pageId = created.id as number
    }
    await payload.create({
      collection: 'subtle-system-nodes',
      data: {
        slug: node.slug as 'mooladhara',
        page: pageId,
      },
      req,
    })
  }

  // --- Backfill Frames.category onto subtleSystemNode + tags ------------------
  // Chakra/nadi categories become the relationship; the four non-chakra values
  // (`clearing`, `meditate`, `ready`, `namaste`) move into the `frames_tags` array.
  const CATEGORY_TO_NODE_SLUG: Record<string, string> = {
    mooladhara: 'mooladhara',
    swadhistan: 'swadhistan',
    nabhi: 'nabhi',
    void: 'void',
    anahat: 'anahat',
    vishuddhi: 'vishuddhi',
    agnya: 'agnya',
    sahasrara: 'sahasrara',
    kundalini: 'kundalini',
    // Legacy alias used by some imports
    heart: 'anahat',
  }
  for (const [category, slug] of Object.entries(CATEGORY_TO_NODE_SLUG)) {
    await db.run(sql.raw(
      `UPDATE \`frames\`
       SET \`subtle_system_node_id\` = (SELECT \`id\` FROM \`subtle_system_nodes\` WHERE \`slug\` = '${slug}')
       WHERE \`category\` = '${category}';`,
    ))
  }

  // Append the 4 non-chakra category values onto frames_tags.
  // Manually allocate ids/order to avoid a CTE-with-RowNumber roundtrip.
  for (const tag of ['clearing', 'meditate', 'ready', 'namaste']) {
    await db.run(sql.raw(
      `INSERT INTO \`frames_tags\` ("order", "parent_id", "value", "id")
       SELECT
         (SELECT COALESCE(MAX(t."order"), 0) + 1 FROM \`frames_tags\` t WHERE t."parent_id" = f."id"),
         f."id",
         '${tag}',
         (SELECT COALESCE(MAX("id"), 0) FROM \`frames_tags\`) + ROW_NUMBER() OVER (ORDER BY f."id")
       FROM \`frames\` f
       WHERE f."category" = '${tag}';`,
    ))
  }

  // For frames that carry `ida` / `pingala` / `kundalini` as a *tag* (legacy
  // shape) and don't already have a chakra/nadi assigned via category, point
  // the relationship at the matching node before we drop the tag rows.
  for (const slug of ['ida', 'pingala', 'kundalini']) {
    await db.run(sql.raw(
      `UPDATE \`frames\`
       SET \`subtle_system_node_id\` = (SELECT \`id\` FROM \`subtle_system_nodes\` WHERE \`slug\` = '${slug}')
       WHERE \`subtle_system_node_id\` IS NULL
         AND \`id\` IN (SELECT \`parent_id\` FROM \`frames_tags\` WHERE \`value\` = '${slug}');`,
    ))
  }
  // Drop the now-redundant tag rows.
  await db.run(sql`DELETE FROM \`frames_tags\` WHERE \`value\` IN ('ida', 'pingala', 'kundalini');`)

  await db.run(sql`ALTER TABLE \`frames\` DROP COLUMN \`category\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Restore frames.category from the relationship BEFORE we drop subtle_system_nodes,
  // so the schema rebuild below has a non-NULL `category` to copy for every row.
  // (Forward backfill is one-way data; if the relationship is null, fall back to
  //  'mooladhara' so the NOT NULL constraint on the rebuilt table doesn't fail.)
  await db.run(sql`ALTER TABLE \`frames\` ADD COLUMN \`category\` TEXT;`)
  await db.run(sql`
    UPDATE \`frames\`
    SET \`category\` = COALESCE(
      (SELECT \`slug\` FROM \`subtle_system_nodes\` WHERE \`id\` = \`frames\`.\`subtle_system_node_id\`),
      'mooladhara'
    );
  `)

  await db.run(sql`ALTER TABLE \`user_choices_timings\` RENAME TO \`meditation_tags_timings\`;`)
  await db.run(sql`ALTER TABLE \`user_choices\` RENAME TO \`meditation_tags\`;`)
  await db.run(sql`ALTER TABLE \`user_choices_locales\` RENAME TO \`meditation_tags_locales\`;`)
  await db.run(sql`DROP TABLE \`subtle_system_nodes\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags_timings\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditation_tags_timings\`("order", "parent_id", "value", "id") SELECT "order", "parent_id", "value", "id" FROM \`meditation_tags_timings\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags_timings\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags_timings\` RENAME TO \`meditation_tags_timings\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`meditation_tags_timings_order_idx\` ON \`meditation_tags_timings\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_timings_parent_idx\` ON \`meditation_tags_timings\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`generate_slug\` integer DEFAULT true,
  	\`slug\` text NOT NULL,
  	\`color\` text DEFAULT '#000000',
  	\`parent_id\` integer,
  	\`is_featured\` integer DEFAULT false,
  	\`order\` numeric DEFAULT 1,
  	\`is_parent\` integer DEFAULT false NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditation_tags\`("id", "generate_slug", "slug", "color", "parent_id", "is_featured", "order", "is_parent", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "generate_slug", "slug", "color", "parent_id", "is_featured", "order", "is_parent", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditation_tags\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags\` RENAME TO \`meditation_tags\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_slug_idx\` ON \`meditation_tags\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_parent_idx\` ON \`meditation_tags\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_is_parent_idx\` ON \`meditation_tags\` (\`is_parent\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_updated_at_idx\` ON \`meditation_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_created_at_idx\` ON \`meditation_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_filename_idx\` ON \`meditation_tags\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags_locales\` (
  	\`title\` text,
  	\`morning_meditation_id\` integer,
  	\`afternoon_meditation_id\` integer,
  	\`evening_meditation_id\` integer,
  	\`night_meditation_id\` integer,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`morning_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`afternoon_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`evening_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`night_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditation_tags_locales\`("title", "morning_meditation_id", "afternoon_meditation_id", "evening_meditation_id", "night_meditation_id", "id", "_locale", "_parent_id") SELECT "title", "morning_meditation_id", "afternoon_meditation_id", "evening_meditation_id", "night_meditation_id", "id", "_locale", "_parent_id" FROM \`meditation_tags_locales\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags_locales\` RENAME TO \`meditation_tags_locales\`;`)
  await db.run(sql`CREATE INDEX \`meditation_tags_morning_meditation_idx\` ON \`meditation_tags_locales\` (\`morning_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_afternoon_meditation_idx\` ON \`meditation_tags_locales\` (\`afternoon_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_evening_meditation_idx\` ON \`meditation_tags_locales\` (\`evening_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_night_meditation_idx\` ON \`meditation_tags_locales\` (\`night_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_locales_locale_parent_id_unique\` ON \`meditation_tags_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_frames\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`image_set\` text NOT NULL,
  	\`category\` text NOT NULL,
  	\`duration\` numeric,
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
  await db.run(sql`INSERT INTO \`__new_frames\`("id", "image_set", "category", "duration", "file_metadata", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "image_set", "category", "duration", "file_metadata", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`frames\`;`)
  await db.run(sql`DROP TABLE \`frames\`;`)
  await db.run(sql`ALTER TABLE \`__new_frames\` RENAME TO \`frames\`;`)
  await db.run(sql`CREATE INDEX \`frames_updated_at_idx\` ON \`frames\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`frames_created_at_idx\` ON \`frames\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`frames_filename_idx\` ON \`frames\` (\`filename\`);`)
  await db.run(sql`CREATE INDEX \`imageSet_idx\` ON \`frames\` (\`image_set\`);`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`pages_id\` integer,
  	\`meditations_id\` integer,
  	\`songs_id\` integer,
  	\`albums_id\` integer,
  	\`videos_id\` integer,
  	\`lessons_id\` integer,
  	\`lectures_id\` integer,
  	\`lecture_clips_id\` integer,
  	\`frames_id\` integer,
  	\`narrators_id\` integer,
  	\`authors_id\` integer,
  	\`images_id\` integer,
  	\`files_id\` integer,
  	\`audiences_id\` integer,
  	\`meditation_tags_id\` integer,
  	\`song_tags_id\` integer,
  	\`managers_id\` integer,
  	\`clients_id\` integer,
  	\`app_cards_id\` integer,
  	\`forms_id\` integer,
  	\`form_submissions_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`songs_id\`) REFERENCES \`songs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`videos_id\`) REFERENCES \`videos\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lessons_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lectures_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lecture_clips_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`frames_id\`) REFERENCES \`frames\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`narrators_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`authors_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`images_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`files_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditation_tags_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`song_tags_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`managers_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`clients_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`app_cards_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`forms_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`form_submissions_id\`) REFERENCES \`form_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  // Inverse polymorphic-FK fix: source has `user_choices_id`, target wants
  // `meditation_tags_id`. Map the column rename inline.
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "pages_id", "meditations_id", "songs_id", "albums_id", "videos_id", "lessons_id", "lectures_id", "lecture_clips_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "audiences_id", "meditation_tags_id", "song_tags_id", "managers_id", "clients_id", "app_cards_id", "forms_id", "form_submissions_id") SELECT "id", "order", "parent_id", "path", "pages_id", "meditations_id", "songs_id", "albums_id", "videos_id", "lessons_id", "lectures_id", "lecture_clips_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "audiences_id", "user_choices_id", "song_tags_id", "managers_id", "clients_id", "app_cards_id", "forms_id", "form_submissions_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_meditations_id_idx\` ON \`payload_locked_documents_rels\` (\`meditations_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_songs_id_idx\` ON \`payload_locked_documents_rels\` (\`songs_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_albums_id_idx\` ON \`payload_locked_documents_rels\` (\`albums_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_videos_id_idx\` ON \`payload_locked_documents_rels\` (\`videos_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lessons_id_idx\` ON \`payload_locked_documents_rels\` (\`lessons_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lectures_id_idx\` ON \`payload_locked_documents_rels\` (\`lectures_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lecture_clips_id_idx\` ON \`payload_locked_documents_rels\` (\`lecture_clips_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_frames_id_idx\` ON \`payload_locked_documents_rels\` (\`frames_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_narrators_id_idx\` ON \`payload_locked_documents_rels\` (\`narrators_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_authors_id_idx\` ON \`payload_locked_documents_rels\` (\`authors_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_images_id_idx\` ON \`payload_locked_documents_rels\` (\`images_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_files_id_idx\` ON \`payload_locked_documents_rels\` (\`files_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_audiences_id_idx\` ON \`payload_locked_documents_rels\` (\`audiences_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_meditation_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`meditation_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_song_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`song_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_managers_id_idx\` ON \`payload_locked_documents_rels\` (\`managers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_clients_id_idx\` ON \`payload_locked_documents_rels\` (\`clients_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_app_cards_id_idx\` ON \`payload_locked_documents_rels\` (\`app_cards_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_forms_id_idx\` ON \`payload_locked_documents_rels\` (\`forms_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_form_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`form_submissions_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_lectures_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`audiences_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lectures_rels\`("id", "order", "parent_id", "path", "audiences_id") SELECT "id", "order", "parent_id", "path", "audiences_id" FROM \`lectures_rels\`;`)
  await db.run(sql`DROP TABLE \`lectures_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_lectures_rels\` RENAME TO \`lectures_rels\`;`)
  await db.run(sql`CREATE INDEX \`lectures_rels_order_idx\` ON \`lectures_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`lectures_rels_parent_idx\` ON \`lectures_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_rels_path_idx\` ON \`lectures_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`lectures_rels_audiences_id_idx\` ON \`lectures_rels\` (\`audiences_id\`);`)
}
