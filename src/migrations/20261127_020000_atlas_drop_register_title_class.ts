import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// `registration.form.title_class` (#1294) leaves `sy-atlas-translations`: the sign-up heading
// keeps its original key, `registration.form.title`, which no locale but English ever
// translated, so a second key protected no translation. It is swept out of its stored column,
// in every locale and every version row, because the group declares
// `additionalProperties: false` and a copy left behind refuses every later save
// (`src/globals/AGENTS.md`).
//
// `down` restores nothing, on purpose: the previous schema declares the key but requires none,
// so a rolled-back database is one the old schema accepts.

export const RETIRED: Record<string, string[]> = {
  registration_form: ['title_class'],
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [group, keys] of Object.entries(RETIRED)) {
    for (const key of keys) {
      await dropEnglishKey(db, { table: 'sy_atlas_translations', group, key })
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {}
