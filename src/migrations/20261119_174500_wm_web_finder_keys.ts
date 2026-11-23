import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { addEnglishKey, dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// WeMeditate Web is building a meditation library on "Meditate now" (#1223, for
// sydevs/WeMeditateWeb#272). It ships the English strings that work reads, which the seed reaches
// only on a fresh database. These six declare no schema `default`, because
// `mood_meditation_label` and `length_meditation_label` are `plural: true` and a `default` beside
// `plural` is ignored (`src/globals/AGENTS.md`).
//
// ⚠ **Eight rows for six declared keys.** Both label keys are `plural: true`, and the column
// holds the expanded CLDR family — nothing expands it at migration time, so English's `_one` and
// `_other` are written out for each.
//
// ⚠ **`up` never overwrites a word somebody chose.** Each key lands only where English lacks it.
// Of the versions, only the `latest: true` row gets it: a global's update loads the document it
// changes from that row.

const TABLE = 'wm_web_translations'
const GROUP = 'meditation_general'

const ADDED = [
  { key: 'finder_question', en: 'How are you feeling?' },
  { key: 'length_question', en: 'How much time do you have?' },
  {
    key: 'finder_unavailable',
    en: "We can't load the meditations just now. Please try again shortly.",
  },
  { key: 'all_meditations', en: 'All meditations' },
  { key: 'mood_meditation_label_one', en: '%{mood} · %{count} min' },
  { key: 'mood_meditation_label_other', en: '%{mood} · %{count} min' },
  { key: 'length_meditation_label_one', en: 'Meditation · %{count} min' },
  { key: 'length_meditation_label_other', en: 'Meditation · %{count} min' },
]

// `down` sweeps wider than `up` wrote, and whatever the keys hold. Both label keys are
// `plural: true`, so `_few` and `_many` are legal storage keys too — a Slavic locale needs them,
// and the admin's grouped plural row is what writes them. The previous schema declares none of
// either family, and one stored undeclared key makes `additionalProperties: false` refuse every
// later save of the global.
const DROPPED = [
  ...ADDED.map(({ key }) => key),
  'mood_meditation_label_few',
  'mood_meditation_label_many',
  'length_meditation_label_few',
  'length_meditation_label_many',
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const { key, en } of ADDED) await addEnglishKey(db, { table: TABLE, group: GROUP, key, en })
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const key of DROPPED) await dropEnglishKey(db, { table: TABLE, group: GROUP, key })
}
