import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// `filters.days.label` and `filters.language.empty` leave `sy-atlas-translations`: the widget's
// filter form reads neither since sydevs/SahajAtlasWeb#514. Each is swept out of its stored
// column, in every locale and every version row, because the group declares
// `additionalProperties: false` and a copy left behind refuses every later save
// (`src/globals/AGENTS.md`).
//
// `down` restores nothing, on purpose: the previous schema declares the keys but requires none,
// so a rolled-back database is one the old schema accepts.

const RETIRED = [
  { group: 'filters_days', key: 'label' },
  { group: 'filters_language', key: 'empty' },
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const { group, key } of RETIRED) {
    await dropEnglishKey(db, { table: 'sy_atlas_translations', group, key })
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {}
