import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { dropEnglishKey } from '@/lib/migrations/englishKeyBackfill'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// `search.chrome.placeholder` becomes the atlas's one place-search hint ("Enter your city or
// postcode"), and `search.chrome.city_or_postcode` (#1295), which nothing read, is retired.
//
// 1. A reworded key is a migration: `reconcileEnglishDefaults` fills an absent key and never
//    overwrites one (`src/globals/AGENTS.md`), so a database that holds the old wording keeps it.
//    Each locale's stored value is replaced only where it still equals the wording the seed
//    shipped, so copy an editor changed is left alone.
// 2. The retired key is swept from every locale and every version row, because the group
//    declares `additionalProperties: false` and a copy left behind refuses every later save.

const TABLE = 'sy_atlas_translations'
const GROUP = 'search_chrome'

const WORDING: Record<string, { old: string; new: string }> = {
  en: { old: 'Search for events near…', new: 'Enter your city or postcode' },
  cs: { old: 'Hledat události poblíž…', new: 'Zadejte město nebo PSČ' },
  de: { old: 'Veranstaltungen suchen in …', new: 'Ort oder Postleitzahl eingeben' },
  es: { old: 'Buscar eventos cerca de…', new: 'Introduce tu ciudad o código postal' },
  fr: { old: 'Rechercher des événements près de…', new: 'Saisissez votre ville ou code postal' },
  hu: { old: 'Események keresése a közelben…', new: 'Add meg a városod vagy irányítószámod' },
  nl: { old: 'Zoek evenementen in de buurt van…', new: 'Voer je plaats of postcode in' },
  'pt-BR': { old: 'Buscar eventos perto de…', new: 'Digite sua cidade ou CEP' },
  ru: { old: 'Искать события рядом с…', new: 'Введите город или индекс' },
  uk: { old: 'Шукати події поблизу…', new: 'Введіть місто або поштовий індекс' },
}

/** The live row and the version row a global's own update loads its document from. */
const TARGETS = [
  { table: `${TABLE}_locales`, column: GROUP, latestOnly: sql`` },
  {
    table: `_${TABLE}_v_locales`,
    column: `version_${GROUP}`,
    latestOnly: sql`AND "_parent_id" IN (SELECT "id" FROM ${sql.identifier(`_${TABLE}_v`)} WHERE "latest")`,
  },
]

async function reword(db: MigrateUpArgs['db'], from: 'old' | 'new', to: 'old' | 'new') {
  for (const [locale, wording] of Object.entries(WORDING)) {
    for (const target of TARGETS) {
      const col = sql.identifier(target.column)
      // ⚠ `jsonb_typeof` keeps a non-object column out: `||` on a scalar builds an array.
      await db.execute(sql`
        UPDATE ${sql.identifier(target.table)}
          SET ${col} = ${col} || jsonb_build_object('placeholder'::text, ${wording[to]}::text)
          WHERE "_locale" = ${locale}
            AND jsonb_typeof(${col}) = 'object'
            AND ${col} ->> 'placeholder' = ${wording[from]}::text
            ${target.latestOnly}`)
    }
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await reword(db, 'old', 'new')
  await dropEnglishKey(db, { table: TABLE, group: GROUP, key: 'city_or_postcode' })
}

// The previous schema declares `city_or_postcode` but requires none, so down restores only the
// wording a locale still holds as shipped.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await reword(db, 'new', 'old')
}
