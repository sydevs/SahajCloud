/**
 * Sahaja Glossary Seed — the `sahaja-glossary` global
 *
 * While the global is hidden from every admin menu, `data.json` beside this
 * file is the source of truth for its contents: a change goes into the file and
 * a re-seed carries it. Nothing in the CMS can edit it.
 *
 * ⚠ **EVERY write carries the id of the row it means to change — the English
 * one included.** Payload matches an incoming array row to a stored one by
 * `id` alone, and DELETES every stored row the incoming array does not claim
 * (`getExistingRowDoc`, then drizzle's `deleteExistingArrayRows`).
 * `sahaja_glossary_terms_locales` is `ON DELETE cascade`, so a row dropped that
 * way takes every locale's spelling with it.
 *
 * So the stored ids are read BEFORE the first write, not after it. An English
 * write without them rebuilds all 56 rows, and any locale this file does not
 * carry — `cs`, `pl`, `uk` — is silently emptied on every re-seed, while its
 * `translatorNotes` survives in the parent row. Measured: the `cs` spelling
 * went to `undefined` and every row id changed. A later locale's write cannot
 * repair it, because the English write has already destroyed the cell.
 *
 * `key`, `category` and `keepAsIs` are not localized, so they live on the row
 * itself rather than in a per-locale cell, and ride along on every locale's
 * write — Payload validates the row it is handed, and both of the first two are
 * `required`.
 *
 * ⚠ **A locale with no value for a term is written `null`, never English.**
 * Consumers read a `keepAsIs` term's English spelling knowing it is English;
 * what they cannot do is tell an untranslated term from a deliberately English
 * one, so the seed never guesses. Writing `null` rather than omitting the field
 * is what makes a re-run idempotent — an omitted localized field keeps whatever
 * is stored, so a value deleted from the file would survive forever.
 *
 * Idempotent: a re-run overwrites every seeded locale from the file and leaves
 * 56 rows, because every row is matched by the id it already has.
 *
 * Usage:
 *   pnpm seed sahaja-glossary --dry-run
 *   pnpm seed sahaja-glossary
 */

import type { LocaleCode } from '../../src/lib/locales'
import type { SahajaGlossary } from '../../src/payload-types'

import * as path from 'path'

import { DEFAULT_LOCALE, isValidLocale, LOCALES } from '../../src/lib/locales'
import { BaseImporter, type BaseImportOptions } from '../lib'

const SEED_LOCAL_PATH = 'seeds/sahaja-glossary/data.json'
const GLOSSARY_SLUG = 'sahaja-glossary'

/** The shape of `data.json`. `values` and `translatorNotes` are keyed by locale. */
interface GlossarySeedFile {
  terms: {
    key: string
    category: string
    keepAsIs?: boolean
    values: Record<string, string>
  }[]
  translatorNotes?: Record<string, string[]>
}

/** `key` → row id, for whichever rows the given document carries. */
const idsOf = (doc: SahajaGlossary): Map<string, string> =>
  new Map((doc.terms ?? []).flatMap((row) => (row.id ? [[row.key, row.id] as const] : [])))

/** One `terms` row as `updateGlobal` takes it. `id` is absent only for a NEW term. */
interface TermRow {
  id?: string
  key: string
  category: string
  keepAsIs: boolean
  term: string | null
}

export class SahajaGlossaryImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Sahaja Glossary (one global, every locale in data.json)'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/sahaja-glossary')

  protected async import(): Promise<void> {
    if (!this.payload) {
      throw new Error('Payload instance not initialised (BaseImporter contract violation)')
    }

    const { loadJsonData } = await import('../lib/dataLoader')

    let seed: GlossarySeedFile
    try {
      seed = await loadJsonData<GlossarySeedFile>({
        localPath: SEED_LOCAL_PATH,
        inlineContent: this.options.inlineData?.[SEED_LOCAL_PATH],
      })
    } catch (error) {
      this.addError(`Loading ${SEED_LOCAL_PATH}`, error instanceof Error ? error : String(error))
      return
    }

    const locales = this.resolveLocales(seed)
    if (!locales) return

    if (this.options.dryRun) {
      await this.reportDryRun(seed, locales)
      return
    }

    // Claim the rows that already exist before touching anything. A key with no
    // stored row is a new term and correctly goes id-less; a stored key absent
    // from the file is deleted, which is what "the file is the source of truth"
    // means.
    const stored = await this.readStoredIds()
    if (!stored) return

    // English carries every row's non-localized columns, so it goes first. The
    // ids it comes back with cover the rows it just created as well.
    const written = await this.writeLocale(
      seed,
      DEFAULT_LOCALE,
      this.claimRows(this.buildRows(seed, DEFAULT_LOCALE), stored),
    )
    const idsByKey = idsOf(written)

    for (const locale of locales.filter((code) => code !== DEFAULT_LOCALE)) {
      const rows = this.buildRows(seed, locale).map((row) => ({
        ...row,
        id: idsByKey.get(row.key),
      }))

      const unmatched = rows.filter((row) => !row.id).map((row) => row.key)
      if (unmatched.length > 0) {
        // Writing these would append duplicates rather than translate anything.
        this.addError(
          `Writing ${GLOSSARY_SLUG} (locale=${locale})`,
          `No stored row for ${unmatched.length} term(s): ${unmatched.slice(0, 5).join(', ')}`,
        )
        continue
      }

      await this.writeLocale(seed, locale, rows)
    }
  }

  /**
   * Every locale the file carries, in the order `LOCALES` declares them.
   *
   * A code the CMS does not configure is an error rather than a warning: the
   * write would be refused by Payload anyway, and the file is the only place
   * the mistake can be fixed.
   */
  private resolveLocales(seed: GlossarySeedFile): LocaleCode[] | null {
    const seen = new Set<string>()
    for (const term of seed.terms) {
      for (const code of Object.keys(term.values)) seen.add(code)
    }
    for (const code of Object.keys(seed.translatorNotes ?? {})) seen.add(code)

    const unknown = [...seen].filter((code) => !isValidLocale(code))
    if (unknown.length > 0) {
      this.addError(
        `Reading ${SEED_LOCAL_PATH}`,
        `Locale(s) the CMS does not configure: ${unknown.join(', ')}`,
      )
      return null
    }

    seen.add(DEFAULT_LOCALE)
    return LOCALES.map(({ code }) => code).filter((code) => seen.has(code))
  }

  /**
   * Every term, in the file's order, with this locale's spelling or `null`.
   *
   * The non-localized columns ride along on every locale's write. They have to:
   * `key` and `category` are `required`, and Payload validates the row it is
   * handed rather than the row it will merge into.
   */
  private buildRows(seed: GlossarySeedFile, locale: LocaleCode): TermRow[] {
    return seed.terms.map((term) => ({
      key: term.key,
      category: term.category,
      keepAsIs: term.keepAsIs ?? false,
      term: term.values[locale] ?? null,
    }))
  }

  /**
   * `key` → stored row id, or an empty map for a global nobody has written yet.
   *
   * A read that FAILED is not a read that came back empty: filling nothing in
   * would make the next write delete every stored row. So a failure aborts the
   * seed instead, the same call this importer's sibling makes for the two
   * groups it must never overwrite.
   */
  private async readStoredIds(): Promise<Map<string, string> | null> {
    try {
      return idsOf(
        await this.payload.findGlobal({ slug: GLOSSARY_SLUG, locale: DEFAULT_LOCALE, depth: 0 }),
      )
    } catch (error) {
      this.addError(
        `Reading ${GLOSSARY_SLUG} row ids`,
        error instanceof Error ? error : String(error),
      )
      return null
    }
  }

  /** Attach each row's stored id, leaving a term that has none to be created. */
  private claimRows(rows: TermRow[], idsByKey: Map<string, string>): TermRow[] {
    return rows.map((row) => {
      const id = idsByKey.get(row.key)
      return id ? { ...row, id } : row
    })
  }

  /** How many terms this locale has a spelling for. */
  private spellingCount(seed: GlossarySeedFile, locale: LocaleCode): number {
    return seed.terms.filter((term) => term.values[locale] != null).length
  }

  private async writeLocale(
    seed: GlossarySeedFile,
    locale: LocaleCode,
    terms: TermRow[],
  ): Promise<SahajaGlossary> {
    const notes = seed.translatorNotes?.[locale]

    let written: SahajaGlossary
    try {
      written = await this.payload.updateGlobal({
        slug: GLOSSARY_SLUG,
        locale,
        data: {
          terms,
          translatorNotes: notes ? notes.join('\n') : null,
        } as Parameters<typeof this.payload.updateGlobal>[0]['data'],
      })
    } catch (error) {
      this.addError(
        `updateGlobal ${GLOSSARY_SLUG} locale=${locale}`,
        error instanceof Error ? error : String(error),
      )
      throw error
    }

    const translated = terms.filter((row) => row.term !== null).length
    await this.logger.success(
      `Updated "${GLOSSARY_SLUG}" (locale=${locale}): ${terms.length} row(s), ${translated} with a spelling`,
    )
    this.report.incrementUpdated()
    await this.reportDocument(GLOSSARY_SLUG, locale, 'updated')

    return written
  }

  /** `--dry-run` reports the term count per locale and writes nothing. */
  private async reportDryRun(seed: GlossarySeedFile, locales: LocaleCode[]): Promise<void> {
    await this.logger.info(
      `[dry-run] Would write ${seed.terms.length} term(s) to "${GLOSSARY_SLUG}" in ${locales.length} locale(s)`,
    )

    for (const locale of locales) {
      const translated = this.spellingCount(seed, locale)
      const notes = seed.translatorNotes?.[locale]?.length ?? 0
      await this.logger.info(
        `[dry-run]   ${locale}: ${translated} spelling(s), ${notes} translator note(s)`,
      )
      this.report.incrementCreated()
      await this.reportDocument(GLOSSARY_SLUG, locale, 'created')
    }
  }
}

export default SahajaGlossaryImporter
