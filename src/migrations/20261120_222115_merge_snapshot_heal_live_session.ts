import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * No DDL. This migration exists for its snapshot alone.
 *
 * 20261119_223756_merge_snapshot_heal healed the chain on main after
 * 20261118_235242_wm_web_drop_video_tab dropped the four video columns under a later
 * timestamp. This branch's two live-session migrations carry later timestamps still, and
 * their snapshots were generated before that drop reached it, so merging main back in left
 * the newest snapshot on disk describing a schema that still held the columns. The next
 * migrate:create would have diffed against it and re-emitted the four DROP COLUMN
 * statements, which abort the boot migration on a database that already ran them (#566).
 *
 * This file's .json was generated on the merged tree, so it is the first snapshot that
 * describes both branches. Keep the timestamp: it is what makes it newest.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
