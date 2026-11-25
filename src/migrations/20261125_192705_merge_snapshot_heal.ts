import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * No DDL. This migration exists for its snapshot alone.
 *
 * Two already-applied migrations carry a timestamp between this branch's own:
 * 20261123_185218_pages_parent_index_pages, which adds the page `parent` column, the two
 * wm_web_config index-page columns and their constraints and indexes, and
 * 20261125_152923_atlas_drop_compact_tab, which drops the two atlas `compact` columns. So
 * the newest snapshot on disk described a schema holding none of them, and the next
 * migrate:create re-emitted their statements, which abort the boot migration on a database
 * that already ran them (#566).
 *
 * This file's .json was generated on the merged tree, so it is the first snapshot that
 * describes every branch. Keep the timestamp: it is what makes it newest.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
