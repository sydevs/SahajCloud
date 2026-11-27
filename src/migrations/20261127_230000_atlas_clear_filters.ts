import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only, no DDL: the `.json` is the prior snapshot re-stamped (`src/migrations/AGENTS.md`).
//
// `filters.chrome.clear` becomes "Clear filters": the atlas's filter buttons on a computer share
// it with the filters' footer and the empty-results button, where "Clear all" read as clearing
// more than the filters. A reworded key is a migration: `reconcileEnglishDefaults` fills an absent
// key and never overwrites one (`src/globals/AGENTS.md`). Each locale's stored value is replaced
// only where it still equals the wording the seed shipped, so copy an editor changed is left alone.

const TABLE = 'sy_atlas_translations'
const GROUP = 'filters_chrome'

const WORDING: Record<string, { old: string; new: string }> = {
  en: { old: 'Clear all', new: 'Clear filters' },
  cs: { old: 'Vymazat vše', new: 'Zrušit filtry' },
  de: { old: 'Alle zurücksetzen', new: 'Filter zurücksetzen' },
  es: { old: 'Borrar todo', new: 'Borrar filtros' },
  fr: { old: 'Tout effacer', new: 'Effacer les filtres' },
  hu: { old: 'Összes törlése', new: 'Szűrők törlése' },
  nl: { old: 'Alles wissen', new: 'Filters wissen' },
  'pt-BR': { old: 'Limpar tudo', new: 'Limpar filtros' },
  ru: { old: 'Сбросить все', new: 'Сбросить фильтры' },
  uk: { old: 'Очистити все', new: 'Скинути фільтри' },
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
          SET ${col} = ${col} || jsonb_build_object('clear'::text, ${wording[to]}::text)
          WHERE "_locale" = ${locale}
            AND jsonb_typeof(${col}) = 'object'
            AND ${col} ->> 'clear' = ${wording[from]}::text
            ${target.latestOnly}`)
    }
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await reword(db, 'old', 'new')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await reword(db, 'new', 'old')
}
