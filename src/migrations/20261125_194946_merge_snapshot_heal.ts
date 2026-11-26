import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * No DDL. This migration exists for its snapshot alone.
 *
 * 20261125_152923_atlas_drop_compact_tab already drops both compact columns, and
 * 20261125_191905_merge_snapshot_heal carries a later timestamp from this branch, so the
 * newest snapshot on disk described a schema that still held them. The next
 * migrate:create would have diffed against it and re-emitted both DROP COLUMN
 * statements, which abort the boot migration on a database that already ran them (#566).
 *
 * This file's .json was generated on the merged tree, so it is the first snapshot that
 * describes both branches. Keep the timestamp: it is what makes it newest.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
