import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { addEnglishKey, dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// Sahaj Atlas's `calendar.day_count` and `calendar.more` are plural keys, and a plural key's
// English cannot be a schema `default` (`src/globals/AGENTS.md`), so production gets its English
// families here. `calendar.none` declares a default and needs nothing.

const TABLE = 'sy_atlas_translations'
const GROUP = 'calendar'

const ENGLISH = {
  day_count_one: '%{count} class',
  day_count_other: '%{count} classes',
  more_one: '+ %{count} class',
  more_other: '+ %{count} classes',
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [key, en] of Object.entries(ENGLISH)) {
    await addEnglishKey(db, { table: TABLE, group: GROUP, key, en })
  }
}

// The previous schema refuses every new key, so down sweeps each stored form from every locale,
// `none` included (the boot reconcile writes its English).
const NEW_KEYS = [
  ...['day_count', 'more'].flatMap((key) =>
    ['one', 'few', 'many', 'other'].map((form) => `${key}_${form}`),
  ),
  'none',
]

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const key of NEW_KEYS) {
    await dropEnglishKey(db, { table: TABLE, group: GROUP, key })
  }
}
