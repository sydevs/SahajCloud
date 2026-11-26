import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// `event.display.chip_starts`, `chip_ended` and `chip_full` leave `sy-atlas-translations`: the
// widget renders none of them since sydevs/SahajAtlasWeb#500. Each is swept out of the stored
// `event_display` column, in every locale and every version row, because the group declares
// `additionalProperties: false` and a copy left behind refuses every later save
// (`src/globals/AGENTS.md`).
//
// `down` restores nothing, on purpose: the previous schema declares the keys but requires none,
// so a rolled-back database is one the old schema accepts.

const RETIRED = ['chip_starts', 'chip_ended', 'chip_full']

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const key of RETIRED) {
    await dropEnglishKey(db, { table: 'sy_atlas_translations', group: 'event_display', key })
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {}
