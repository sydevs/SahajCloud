import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// `common.errors.captcha_blocked` leaves `sy-atlas-translations`: the widget's registration
// form owns `registration.form.captcha_blocked` now (sydevs/SahajAtlasWeb#490). The key is swept
// out of the stored `common_errors` column, in every locale and every version row, because the
// group declares `additionalProperties: false` and a copy left behind refuses every later save
// (`src/globals/AGENTS.md`).
//
// `down` restores nothing, on purpose: the previous schema declares the key but requires none,
// so a rolled-back database is one the old schema accepts, and a locale without it reads as
// untranslated. Writing values back would mean carrying ten translations this deletes.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await dropEnglishKey(db, {
    table: 'sy_atlas_translations',
    group: 'common_errors',
    key: 'captcha_blocked',
  })
}

export async function down(_args: MigrateDownArgs): Promise<void> {}
