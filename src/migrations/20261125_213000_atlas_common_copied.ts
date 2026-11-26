import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { addEnglishKey, dropEnglishKey, moveKey } from '@/lib/migrations/englishKeyBackfill'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Sahaj Atlas's `share.copied` ("Copied") retires for `common.chrome.copied`: one generic
// confirmation now serves the share link, the contact popover and a class's address. Both keys
// live in groups that keep other keys, so the columns stay and the value moves inside them.
// The schema declares `additionalProperties: false`, so a `share.copied` left in any locale or
// version row refuses every later save of the global (`src/globals/AGENTS.md`).
//
// Up carries each row's `share.copied` into `common_chrome.copied` where that is blank — a
// translator's or seeded copy is kept — then sweeps `share.copied` out. Down carries it back,
// sweeps `common_chrome.copied` (the previous schema refuses it), and restores English
// `share.copied` where it is still absent.

const TABLE = 'sy_atlas_translations'

const SHARE = { group: 'share', key: 'copied' }
const CHROME = { group: 'common_chrome', key: 'copied' }

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await moveKey(db, { table: TABLE, from: SHARE, to: CHROME })
  await dropEnglishKey(db, { table: TABLE, ...SHARE })
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await moveKey(db, { table: TABLE, from: CHROME, to: SHARE })
  await dropEnglishKey(db, { table: TABLE, ...CHROME })
  await addEnglishKey(db, { table: TABLE, ...SHARE, en: 'Copied' })
}
