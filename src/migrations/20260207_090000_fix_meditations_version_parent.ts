import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Data migration: backfill _meditations_v.parent_id using meditations.filename.
 *
 * This fixes admin list links that relied on version records with null parent_id,
 * which caused /admin/collections/meditations/null links when drafts are enabled.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    UPDATE _meditations_v
    SET parent_id = (
      SELECT id FROM meditations m
      WHERE m.filename = _meditations_v.version_filename
    )
    WHERE parent_id IS NULL
      AND version_filename IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM meditations m
        WHERE m.filename = _meditations_v.version_filename
      );
  `)
}

// No safe down migration for data backfill
export async function down({}: MigrateDownArgs): Promise<void> {
  // Intentionally left blank
}
