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
import type { TranscriptSegment } from '@/lib/meditations/transcript'
import { PREVIEW_ASSET_PREFIX } from '@/plugins/storage/previewIsolation'

import { BaseImporter, type BaseImportOptions, loadJsonData } from '../lib'

/**
 * ⚠ `SCRIPT_DATA_FILES` in `seeds/run.ts` is keyed by this exact string. A
 * deployed route cannot read a seed file off disk (`seeds/**` is outside the
 * build trace), so the CLI uploads the file under this key and `loadJsonData`
 * reads it back from `inlineData`. Spelled differently in the two places, the
 * script works locally and silently imports nothing in production.
 */
export const DATA_FILE = 'seeds/meditation-transcripts/data.json'

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

export class MeditationTranscriptsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Meditation Transcripts'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/meditation-transcripts')

  private meditations: Map<number, LibraryMeditation> = new Map()

  protected async setup(): Promise<void> {
    if (this.options.dryRun) return

    // ⚠ The preload is what stops a re-seed failing. Without it `upsert` takes
    // its "preloaded, absent" branch straight to `payload.create` and the
    // `unique` index on `meditation` refuses every row.
    await this.preloadCollection('meditation-transcripts', 'meditation')
    await this.loadLibrary()
  }

  protected async import(): Promise<void> {
    const entries = await this.loadData()

    if (this.options.dryRun) {
      this.validateDryRun(entries)
      return
    }

    let current = 0
    for (const entry of entries) {
      current += 1
      try {
        await this.importEntry(entry, current, entries.length)
      } catch (error) {
        this.addError(`Transcript for meditation ${entry.meditationId}`, error as Error)
        continue
      }
    }
  }

  // ─── Resolving the meditation ───────────────────────────────────────────

  /**
   * Every meditation, by id, with the recording it carries now.
   *
   * ⚠ `locale: 'all'` is load-bearing, and `preloadCollection` cannot stand in
   * for this read. `filterMeditationsByLocale` appends `{ locale: { equals:
   * req.locale } }` to every `find`, and a Local API call with no locale
   * resolves that to the default `en` — so a plain read cannot see the one
   * French meditation at all.
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
        Number(doc.id),
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
      return
    }
    if (meditation.trashed) {
      this.addWarning(`Meditation ${meditationId}: meditation is trashed — transcript skipped.`)
      return
    }

    // ⚠ The id is a hint and the filename is the proof. These ids are
    // production's row numbers, and the meditations seed assigns its own — so on
    // another database id 5 is a different recording, and a transcript on the
    // wrong meditation is worse than none. Every upload here is renamed
    // `<slug>-<6 base36>.<ext>`, so the suffix is unique per upload: the pair
    // agrees where the file was transcribed and disagrees after a re-upload.
    const filename = stripPreviewPrefix(meditation.filename)
    if (filename !== entry.audioFilename) {
      this.addWarning(
        `Meditation ${meditationId}: carries ${filename ?? 'no recording'}, not ${entry.audioFilename} — transcript skipped.`,
      )
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
        // These transcripts already exist, so there is no job to await. `error`
        // stays unset and `outdated` keeps its `false` default, which the live
        // transcription owns and writes when a recording is replaced.
        status: 'completed',
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

  private validateDryRun(entries: TranscriptEntry[]): void {
    const seen = new Set<number>()
    for (const entry of entries) {
      if (seen.has(entry.meditationId)) {
        this.addError('Dry run', `Duplicate meditationId ${entry.meditationId} in ${DATA_FILE}.`)
      }
      seen.add(entry.meditationId)

      for (const [index, segment] of entry.segments.entries()) {
        if (
          !Number.isFinite(segment.startTimeMs) ||
          !Number.isFinite(segment.endTimeMs) ||
          segment.startTimeMs > segment.endTimeMs
        ) {
          this.addError(
            'Dry run',
            `Meditation ${entry.meditationId} segment ${index}: ${segment.startTimeMs}–${segment.endTimeMs} is not a forward range.`,
          )
        }
      }
    }

    const phrases = entries.reduce((total, entry) => total + entry.segments.length, 0)
    this.logger.info(`\nValidated ${entries.length} entries, ${phrases} phrases.`)
    // Without the library there is nothing to resolve an id against, so a
    // reader must not take this count as "126 would import".
    this.logger.info(
      'Which ids would be skipped is not reported: that answer needs the meditations in the target database.',
    )
  }

  private async loadData(): Promise<TranscriptEntry[]> {
    return loadJsonData<TranscriptEntry[]>({
      localPath: DATA_FILE,
      inlineContent: this.options.inlineData?.[DATA_FILE],
    })
  }
}

/** A preview environment prefixes every asset it owns; the stem is the proof. */
function stripPreviewPrefix(filename: string | null): string | null {
  if (!filename) return null
  return filename.startsWith(PREVIEW_ASSET_PREFIX)
    ? filename.slice(PREVIEW_ASSET_PREFIX.length)
    : filename
}

export default MeditationTranscriptsImporter
