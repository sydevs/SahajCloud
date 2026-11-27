import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// Three keys leave `sy-atlas-translations` (#1290): the widget no longer reads them, because
// Share opens straight from the event's action row and is hidden when a class has no link. Each
// is swept out of its stored column, in every locale and every version row, because the group
// declares `additionalProperties: false` and a copy left behind refuses every later save
// (`src/globals/AGENTS.md`).
//
// `down` restores nothing, on purpose: the previous schema declares the keys but requires none,
// so a rolled-back database is one the old schema accepts.

export const RETIRED: Record<string, string[]> = {
  share: ['title', 'title_class'],
  common_errors: ['share_unavailable_class'],
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [group, keys] of Object.entries(RETIRED)) {
    for (const key of keys) {
      await dropEnglishKey(db, { table: 'sy_atlas_translations', group, key })
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {}
