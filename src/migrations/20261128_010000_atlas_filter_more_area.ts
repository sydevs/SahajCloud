import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { addEnglishKey, dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// Sahaj Atlas's `filters.chrome.more_area` is a plural key, and a plural key's English cannot be a
// schema `default` (`src/globals/AGENTS.md`), so production gets its English family here.

const TABLE = 'sy_atlas_translations'
const GROUP = 'filters_chrome'

const ENGLISH = {
  more_area_one: '%{count} more class in this area.',
  more_area_other: '%{count} more classes in this area.',
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [key, en] of Object.entries(ENGLISH)) {
    await addEnglishKey(db, { table: TABLE, group: GROUP, key, en })
  }
}

// The previous schema refuses the new key, so down sweeps each stored form from every locale.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const form of ['one', 'few', 'many', 'other']) {
    await dropEnglishKey(db, { table: TABLE, group: GROUP, key: `more_area_${form}` })
  }
}
