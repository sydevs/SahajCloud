import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * No DDL. This migration exists for its snapshot alone.
 *
 * 20261124_042718_import_created_regions already adds "imports"."created_regions", and
 * 20261125_152923_atlas_drop_compact_tab and 20261125_191844_merge_snapshot_heal both carry
 * later timestamps off a branch that never saw that column, so the newest snapshot on disk
 * described a schema without it. The next migrate:create would have diffed against that and
 * re-emitted the ADD COLUMN, which aborts the boot migration on a database that already ran
 * it (#566).
 *
 * This file's .json was generated on the merged tree, so it is the first snapshot that
 * describes both branches. Keep the timestamp: it is what makes it newest.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
