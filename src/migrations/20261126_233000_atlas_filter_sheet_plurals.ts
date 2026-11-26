import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { addEnglishKey, dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
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

// The previous schema refuses these keys, so down sweeps them from every locale.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const key of Object.keys(ENGLISH)) {
    await dropEnglishKey(db, { table: TABLE, group: GROUP, key })
  }
}
