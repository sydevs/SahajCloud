import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { addEnglishKey, dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// Sahaj Atlas's `filters.language.count` and `filters.when.count` are plural keys, and a plural
// key's English cannot be a schema `default` (`src/globals/AGENTS.md`), so production gets its
// English families here.

const TABLE = 'sy_atlas_translations'

const ENGLISH = {
  filters_language: { count_one: '%{count} language', count_other: '%{count} languages' },
  filters_when: { count_one: '%{count} timing', count_other: '%{count} timings' },
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [group, keys] of Object.entries(ENGLISH)) {
    for (const [key, en] of Object.entries(keys)) {
      await addEnglishKey(db, { table: TABLE, group, key, en })
    }
  }
}

// The previous schema refuses every new key, so down sweeps each stored form from every locale.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const group of Object.keys(ENGLISH)) {
    for (const form of ['one', 'few', 'many', 'other']) {
      await dropEnglishKey(db, { table: TABLE, group, key: `count_${form}` })
    }
  }
}
