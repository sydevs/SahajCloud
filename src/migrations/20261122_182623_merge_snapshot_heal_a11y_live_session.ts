import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * No DDL. This migration exists for its snapshot alone.
 *
 * 20261121_035055_wm_web_drop_a11y_groups and 20261121_035100_atlas_drop_a11y_keys landed on
 * main under timestamps later than this branch's live-session migrations, and their snapshots
 * were generated before `blocks_live_session` existed. So merging main in left the newest
 * snapshot on disk describing a schema without that column, and the next migrate:create
 * re-emitted both of 20261119_230234_wm_web_live_session_keys' ADD COLUMN statements — which
 * abort the boot migration on a database that already ran them (#566).
 *
 * This file's .json was generated on the merged tree, so it is the first snapshot that
 * describes both branches. Keep the timestamp: it is what makes it newest.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
