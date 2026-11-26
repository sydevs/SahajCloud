import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// Eight event-worded keys leave `sy-atlas-translations`: since sydevs/SahajAtlasWeb#517 the widget
// reads their class-worded replacements from #1289 instead. Each is swept out of its stored
// column, in every locale and every version row, because the group declares
// `additionalProperties: false` and a copy left behind refuses every later save
// (`src/globals/AGENTS.md`).
//
// `down` restores nothing, on purpose: the previous schema declares the keys but requires none,
// so a rolled-back database is one the old schema accepts.

export const RETIRED: Record<string, string[]> = {
  common_errors: ['share_unavailable', 'no_events', 'near_city'],
  search_results: ['no_nearby'],
  filters_chrome: ['no_results'],
  event_display: ['event_ended', 'event_full', 'type_oneoff'],
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [group, keys] of Object.entries(RETIRED)) {
    for (const key of keys) {
      await dropEnglishKey(db, { table: 'sy_atlas_translations', group, key })
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {}
