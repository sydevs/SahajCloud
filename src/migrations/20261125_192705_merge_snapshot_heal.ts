import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * No DDL. This migration exists for its snapshot alone.
 *
 * 20261123_185218_pages_parent_index_pages already adds the page `parent` column, the
 * two wm_web_config index-page columns and their constraints and indexes, and
 * 20261125_191100_require_app_live_reminder_page carries a later timestamp, so the
 * newest snapshot on disk described a schema that held none of them. The next
 * migrate:create would have diffed against that and re-emitted all twelve statements,
 * which abort the boot migration on a database that already ran them (#566).
 *
 * This file's .json was generated on the merged tree, so it is the first snapshot that
 * describes both branches. Keep the timestamp: it is what makes it newest.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
