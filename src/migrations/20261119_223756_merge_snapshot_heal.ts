import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * No DDL. This migration exists for its snapshot alone.
 *
 * 20261118_235242_wm_web_drop_video_tab already drops the four video columns, and
 * 20261119_044129_tidy_event_form carries a later timestamp, so the newest snapshot
 * on disk described a schema that still held them. The next migrate:create would have
 * diffed against that and re-emitted the four DROP COLUMN statements, which abort the
 * boot migration on a database that already ran them (#566).
 *
 * This file's .json was generated on the merged tree, so it is the first snapshot that
 * describes both branches. Keep the timestamp: it is what makes it newest.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
