#!/usr/bin/env tsx

/**
 * Import the library's existing meditation transcripts.
 *
 * The 126 transcripts were produced once, from the library's own recordings,
 * and `data.json` beside this file carries them in the stored cue shape. The
 * import writes one `completed` row per meditation that still carries the
 * recording it was transcribed from, so nobody pays to transcribe the library
 * again (#954).
 *
 * `generate.ts` beside this file is what produced `data.json`, from the files
 * on `proposal/897-transcripts`.
 *
 * Usage: `pnpm seed meditation-transcripts [--dry-run] [--update]`
 */
import * as path from 'path'

import { getLocaleLabel, type LocaleCode } from '@/lib/locales'
import { transcriptSegmentsSchema, type TranscriptSegment } from '@/lib/meditations/transcript'
import { stripPreviewPrefix } from '@/plugins/storage/previewIsolation'

import {
  BaseImporter,
  type BaseImportOptions,
  loadJsonData,
  type RunVerification,
} from '../lib'
import { MEDITATION_TRANSCRIPTS_DATA_FILE as DATA_FILE } from '../lib/dataFiles'

/** One entry of `data.json` — a source file's own keys, segments converted. */
export interface TranscriptEntry {
  meditationId: number
  audioFilename: string
  /** The source file's own language name (`english`, `french`): provenance. */
  language: string
  provider: string
  segments: TranscriptSegment[]
}

type LibraryMeditation = {
  filename: string | null
  locale: LocaleCode
  trashed: boolean
}

/** What one run of this script did, split by how each entry ended. */
export interface EntryDisposition {
  entries: number
  created: number
  updated: number
  skipped: number
  errors: number
  /** Entries resolved to no write at all, each warned about by name. */
  unresolved: number
}

/**
 * Every entry ended in a write, an error, or a skip that named its reason.
 *
 * This is what the script can assert when no database floor can be stated: how
 * many of the 126 transcripts import depends on which recordings the target
 * library still carries, so `EXPECTED_COUNTS` declares `not-applicable`. The
 * two sides are counted by different code — `unresolved` here, the rest by
 * `upsert` — so a disposition this importer stops counting, or an `upsert`
 * branch that returns without counting, breaks the equality.
 */
export function verifyEntriesAccountedFor(run: EntryDisposition): RunVerification {
  const accounted = run.created + run.updated + run.skipped + run.errors + run.unresolved
  if (accounted === run.entries) return { failures: [] }

  return {
    failures: [
      `${run.entries} entries, ${accounted} accounted for: ${run.created} created, ` +
        `${run.updated} updated, ${run.skipped} skipped, ${run.errors} errors, ` +
        `${run.unresolved} unresolved.`,
    ],
  }
}

export class MeditationTranscriptsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Meditation Transcripts'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/meditation-transcripts')

  private meditations: Map<number, LibraryMeditation> = new Map()
  private entriesSeen = 0
  private unresolved = 0

  protected async setup(): Promise<void> {
    if (this.options.dryRun) return

    // ⚠ Preloading is what makes the natural key load-bearing: once a
    // collection is in the cache, a key the cache does not hold goes straight
    // to `payload.create` with no fallback find, and the `unique` index on
    // `meditation` refuses it. So the cache's own key — `String(doc.meditation)`
    // at depth 0 — has to agree with what `extractNaturalKeyValue` derives from
    // the `where` below, and nothing but a re-seed proves that it does.
    await Promise.all([
      this.preloadCollection('meditation-transcripts', 'meditation'),
      this.loadLibrary(),
    ])
  }

  protected async import(): Promise<void> {
    const entries = await this.loadData()
    this.entriesSeen = entries.length

    if (this.options.dryRun) {
      await this.validateDryRun(entries)
      return
    }

    for (const [index, entry] of entries.entries()) {
      try {
        await this.importEntry(entry, index + 1, entries.length)
      } catch (error) {
        this.addError(`Transcript for meditation ${entry.meditationId}`, error as Error)
        continue
      }
    }
  }

  /**
   * `verifyEntriesAccountedFor` over this run's own totals.
   *
   * Not the `created + updated + skipped + warnings === entries` #967 names:
   * the language-mismatch warning below lands on an entry that then imports,
   * so warnings are not one per unimported entry and that equality fails on a
   * healthy run. `unresolved` counts the skips instead.
   */
  protected async verifyRun(): Promise<RunVerification> {
    const { created, updated, skipped, errors } = this.report.getSummary()
    return verifyEntriesAccountedFor({
      entries: this.entriesSeen,
      created,
      updated,
      skipped,
      errors,
      unresolved: this.unresolved,
    })
  }

  // ─── Resolving the meditation ───────────────────────────────────────────

  /**
   * Every meditation, by id, with the recording it carries now.
   *
   * ⚠ `locale: 'all'` is load-bearing. `filterMeditationsByLocale` appends
   * `{ locale: { equals: req.locale } }` to every `find`, and a Local API call
   * with no locale resolves that to the default `en` — so a plain read cannot
   * see the one French meditation at all. `preloadCollection` takes a locale
   * since #967, but it caches one document per natural key for an existence
   * check — this read keys on id and carries three fields per row.
   */
  private async loadLibrary(): Promise<void> {
    const result = await this.payload.find({
      collection: 'meditations',
      locale: 'all',
      depth: 0,
      limit: 0,
      // A trashed meditation still answers for its id, and an entry pointing at
      // one is a skip with its own reason rather than an unknown id.
      trash: true,
      select: { filename: true, locale: true, deletedAt: true },
    })

    this.meditations = new Map(
      result.docs.map((doc) => [
        doc.id,
        {
          filename: doc.filename ?? null,
          locale: doc.locale as LocaleCode,
          trashed: Boolean(doc.deletedAt),
        },
      ]),
    )

    await this.logger.info(`✓ Loaded ${this.meditations.size} meditations (all locales)`)
  }

  private async importEntry(entry: TranscriptEntry, current: number, total: number): Promise<void> {
    const { meditationId } = entry

    const meditation = this.meditations.get(meditationId)
    if (!meditation) {
      this.addWarning(`Meditation ${meditationId}: no such meditation — transcript skipped.`)
      this.unresolved += 1
      return
    }
    if (meditation.trashed) {
      this.addWarning(`Meditation ${meditationId}: meditation is trashed — transcript skipped.`)
      this.unresolved += 1
      return
    }

    // ⚠ The id is a hint and the filename is the proof. These ids are
    // production's row numbers, and the meditations seed assigns its own — so on
    // another database id 5 is a different recording, and a transcript on the
    // wrong meditation is worse than none. Every upload here is renamed
    // `<slug>-<6 base36>.<ext>`, so the suffix is unique per upload: the pair
    // agrees where the file was transcribed and disagrees after a re-upload.
    const filename = meditation.filename && stripPreviewPrefix(meditation.filename)
    if (filename !== entry.audioFilename) {
      this.addWarning(
        `Meditation ${meditationId}: carries ${filename ?? 'no recording'}, not ${entry.audioFilename} — transcript skipped.`,
      )
      this.unresolved += 1
      return
    }

    if (getLocaleLabel(meditation.locale).toLowerCase() !== entry.language) {
      this.addWarning(
        `Meditation ${meditationId}: transcribed as ${entry.language}, stored as ${meditation.locale}.`,
      )
    }

    await this.upsert(
      'meditation-transcripts',
      { meditation: { equals: meditationId } },
      {
        meditation: meditationId,
        // These already exist, so the row carries cues from the start and
        // `queueTranscription` asks for nothing. `status` derives `completed`
        // from them, and there is no job row to read an error off.
        provider: 'lemonfox',
        // The meditation's own locale, not the file's language name: the column
        // is a select over the configured locales, and the glossary keys on it.
        // Sent on every write, including an update, so the collection's
        // `applyGlossaryToSegments` hook has its key.
        language: meditation.locale,
        audioFilename: entry.audioFilename,
        segments: entry.segments,
      },
      { identifier: `meditation ${meditationId}`, current, total },
    )
  }

  // ─── Dry run: the data file alone (no DB, no network) ───────────────────

  private async validateDryRun(entries: TranscriptEntry[]): Promise<void> {
    const seen = new Set<number>()
    for (const entry of entries) {
      if (seen.has(entry.meditationId)) {
        this.addError('Dry run', `Duplicate meditationId ${entry.meditationId} in ${DATA_FILE}.`)
      }
      seen.add(entry.meditationId)

      // The column's own schema, not a hand-rolled shape check: closed, so it
      // also refuses a stray word-timing key the import must never carry.
      const shape = transcriptSegmentsSchema.safeParse(entry.segments)
      if (!shape.success) {
        this.addError(
          'Dry run',
          `Meditation ${entry.meditationId}: ${shape.error.issues[0].path.join('.')} ${shape.error.issues[0].message}`,
        )
      }

      for (const [index, segment] of entry.segments.entries()) {
        // The one thing no schema expresses.
        if (segment.startTimeMs > segment.endTimeMs) {
          this.addError(
            'Dry run',
            `Meditation ${entry.meditationId} segment ${index}: ${segment.startTimeMs}–${segment.endTimeMs} runs backwards.`,
          )
        }
      }
    }

    const phrases = entries.reduce((total, entry) => total + entry.segments.length, 0)
    // `sendInfo`, not `logger`: a dry run is read from the CLI, and the logger
    // writes to the server's own console. Without the second line a verifier
    // reads "126 validated, 0 errors" as "126 would import" — but a dry run
    // issues no database read, so it has nothing to resolve an id against.
    await this.sendInfo(`Validated ${entries.length} entries, ${phrases} phrases.`)
    await this.sendInfo(
      'Which ids would be skipped is not reported: that needs the meditations in the target database.',
    )
  }

  private async loadData(): Promise<TranscriptEntry[]> {
    return loadJsonData<TranscriptEntry[]>({
      localPath: DATA_FILE,
      inlineContent: this.options.inlineData?.[DATA_FILE],
    })
  }
}

export default MeditationTranscriptsImporter
