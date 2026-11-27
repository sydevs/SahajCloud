import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { addEnglishKey, dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// Sahaj Atlas's `filters.chrome.show_classes` and `filters.chrome.widen` are plural keys, and a
// plural key's English cannot be a schema `default` (`src/globals/AGENTS.md`), so production gets
// its English families here. `filters.chrome.no_match` declares a default and needs nothing.

const TABLE = 'sy_atlas_translations'
const GROUP = 'filters_chrome'

const ENGLISH = {
  show_classes_one: 'Show %{count} class',
  show_classes_other: 'Show %{count} classes',
  widen_one: 'Remove %{label} (%{count} class)',
  widen_other: 'Remove %{label} (%{count} classes)',
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [key, en] of Object.entries(ENGLISH)) {
    await addEnglishKey(db, { table: TABLE, group: GROUP, key, en })
  }
}

// The previous schema refuses every new key, so down sweeps each stored form from every locale,
// `no_match` included (the boot reconcile writes its English).
const NEW_KEYS = [
  ...['show_classes', 'widen'].flatMap((key) =>
    ['one', 'few', 'many', 'other'].map((form) => `${key}_${form}`),
  ),
  'no_match',
]

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const key of NEW_KEYS) {
    await dropEnglishKey(db, { table: TABLE, group: GROUP, key })
  }
}
