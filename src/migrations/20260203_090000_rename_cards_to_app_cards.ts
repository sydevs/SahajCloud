import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Migration: Rename Cards collection to App Cards
 *
 * Renames all cards-related tables and updates payload_locked_documents_rels
 * to use the new app_cards naming convention.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Rename main tables
  await db.run(sql`ALTER TABLE \`cards\` RENAME TO \`app_cards\`;`)
  await db.run(sql`ALTER TABLE \`cards_locales\` RENAME TO \`app_cards_locales\`;`)
  await db.run(sql`ALTER TABLE \`cards_rels\` RENAME TO \`app_cards_rels\`;`)

  // Rename version tables
  await db.run(sql`ALTER TABLE \`_cards_v\` RENAME TO \`_app_cards_v\`;`)
  await db.run(sql`ALTER TABLE \`_cards_v_locales\` RENAME TO \`_app_cards_v_locales\`;`)
  await db.run(sql`ALTER TABLE \`_cards_v_rels\` RENAME TO \`_app_cards_v_rels\`;`)

  // Rename column in payload_locked_documents_rels (requires table recreation in SQLite)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` RENAME COLUMN \`cards_id\` TO \`app_cards_id\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)

  // Note: Indexes are automatically renamed with their tables in SQLite
  // The index names will still reference 'cards' but will function correctly
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Rename column back in payload_locked_documents_rels
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` RENAME COLUMN \`app_cards_id\` TO \`cards_id\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)

  // Rename version tables back
  await db.run(sql`ALTER TABLE \`_app_cards_v_rels\` RENAME TO \`_cards_v_rels\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` RENAME TO \`_cards_v_locales\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` RENAME TO \`_cards_v\`;`)

  // Rename main tables back
  await db.run(sql`ALTER TABLE \`app_cards_rels\` RENAME TO \`cards_rels\`;`)
  await db.run(sql`ALTER TABLE \`app_cards_locales\` RENAME TO \`cards_locales\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` RENAME TO \`cards\`;`)
}
