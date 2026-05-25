import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Data recovery for #402.
 *
 * The previous migration (`20260525_091327`) rebuilt `_app_cards_v` and then
 * dropped/recreated `app_cards`. Cloudflare D1 does not honor `PRAGMA
 * foreign_keys=OFF` across separate `db.run()` calls, so the `DROP TABLE
 * app_cards` fired the `_app_cards_v.parent_id ... ON DELETE set null`
 * cascade and nulled every `parent_id`.
 *
 * Backfill strategy:
 *   Pass 1 — `version_label` uniquely matches one `app_cards.label` → restore.
 *   Pass 2 — `version_label` collides across multiple cards → pair by
 *            `version_updated_at DESC, id DESC` against `app_cards.id DESC`.
 *   Pass 3 — `version_label` no longer matches any card (renamed since the
 *            version was saved) → DELETE; recovery is impossible.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Pass 1: unique-label backfill
  await db.run(sql`
    UPDATE \`_app_cards_v\`
    SET \`parent_id\` = (
      SELECT \`id\` FROM \`app_cards\`
      WHERE \`app_cards\`.\`label\` = \`_app_cards_v\`.\`version_label\`
    )
    WHERE \`parent_id\` IS NULL
      AND \`version_label\` IS NOT NULL
      AND (
        SELECT COUNT(*) FROM \`app_cards\`
        WHERE \`app_cards\`.\`label\` = \`_app_cards_v\`.\`version_label\`
      ) = 1;
  `)

  // Pass 2: ambiguous-label backfill via positional pairing
  await db.run(sql`
    WITH match_pairs AS (
      SELECT v.id AS version_id, c.id AS card_id
      FROM (
        SELECT id, version_label,
          ROW_NUMBER() OVER (
            PARTITION BY version_label
            ORDER BY version_updated_at DESC, id DESC
          ) AS rn
        FROM \`_app_cards_v\`
        WHERE parent_id IS NULL AND version_label IS NOT NULL
      ) v
      JOIN (
        SELECT id, label,
          ROW_NUMBER() OVER (PARTITION BY label ORDER BY id DESC) AS rn
        FROM \`app_cards\`
      ) c ON v.version_label = c.label AND v.rn = c.rn
    )
    UPDATE \`_app_cards_v\`
    SET \`parent_id\` = (
      SELECT card_id FROM match_pairs WHERE version_id = \`_app_cards_v\`.\`id\`
    )
    WHERE \`id\` IN (SELECT version_id FROM match_pairs);
  `)

  // Pass 3: drop unrecoverable orphans
  await db.run(sql`DELETE FROM \`_app_cards_v\` WHERE \`parent_id\` IS NULL;`)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // no-op — this migration recovers data corrupted by 20260525_091327;
  // reversing would re-corrupt the versions table.
}
