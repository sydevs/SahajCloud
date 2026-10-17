/**
 * The `meditation-transcripts` seed importer, against real meditations.
 *
 * Three things only a database can answer, and each is a defect the importer
 * exists to prevent:
 *
 * - The library read passes `locale: 'all'`. `filterMeditationsByLocale`
 *   appends the request's locale to every `find`, and a Local API call with no
 *   locale resolves that to `en` — so without it the one French meditation is
 *   invisible and its transcript is skipped as an unknown id.
 * - The filename is the proof, not the id. These ids are production's row
 *   numbers, so an entry must not write onto whatever row happens to carry its
 *   number here.
 * - The glossary runs in the collection's `beforeChange` hook, and the importer
 *   neither calls it nor bypasses it. `upsert` writes through the Local API, so
 *   the stored phrase is the corrected one.
 *
 * Fixture pre-mortem: every entry names the meditation's own `filename` as
 * Payload stored it, read back rather than hardcoded. ⚠ `tests/utils/testHelpers.ts`
 * registers no storage plugin (checked: its `plugins` array holds six, and
 * `storagePlugin` is not among them), so an upload here keeps the name it was
 * given — neither renamed to `<slug>-<6 base36>.<ext>` by `r2FilenameHook` nor
 * `preview-` prefixed by `applyPreviewPrefix`. The prefix strip therefore has
 * to be provoked by writing the column, which the last case does.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Meditation } from '@/payload-types'
import { PREVIEW_ASSET_PREFIX, stripPreviewPrefix } from '@/plugins/storage/previewIsolation'

import {
  Logger,
  ValidationReport,
  type BaseImportOptions,
  type RunVerification,
} from '../../seeds/lib'
import { MEDITATION_TRANSCRIPTS_DATA_FILE } from '../../seeds/lib/dataFiles'
import {
  MeditationTranscriptsImporter,
  type TranscriptEntry,
} from '../../seeds/meditation-transcripts/import'
import { testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Drives the importer's two lifecycle steps with an injected Payload, the way
 * `seed-importer-preload.int.spec.ts` does. `run()` is not used — it owns the
 * config load, the cache directory and the report file, none of which this
 * needs.
 */
class TranscriptsProbe extends MeditationTranscriptsImporter {
  constructor(
    payload: Payload,
    entries: TranscriptEntry[],
    options: Partial<BaseImportOptions> = {},
  ) {
    super({
      dryRun: false,
      clearCache: false,
      // The real production path: `seeds/**` sits outside the build trace, so
      // the CLI uploads the file and `loadJsonData` reads it back from here.
      inlineData: { [MEDITATION_TRANSCRIPTS_DATA_FILE]: JSON.stringify(entries) },
      ...options,
    })
    this.payload = payload
    this.logger = new Logger()
    this.report = new ValidationReport()
  }

  async drive(): Promise<void> {
    await this.setup()
    await this.import()
  }

  get warnings(): string[] {
    return this.report.getWarnings()
  }

  get errorCount(): number {
    return this.report.getErrorCount()
  }

  /** The run invariant `run()` would check, reachable without booting it. */
  async verify(): Promise<RunVerification> {
    return this.verifyRun()
  }
}

/** One source entry for a meditation, naming the recording it actually carries. */
const entryFor = (meditation: Meditation, language: string, content: string): TranscriptEntry => ({
  meditationId: meditation.id,
  audioFilename: stripPreviewPrefix(meditation.filename ?? ''),
  language,
  provider: 'lemonfox',
  segments: [{ content, startTimeMs: 1720, endTimeMs: 2760 }],
})

/** What the first case stores, re-read by the two that assert it survived. */
const CORRECTED_FIRST_ROW = [
  {
    content: 'Let the Kundalini rise through the fontanelle bone area.',
    startTimeMs: 1720,
    endTimeMs: 2760,
  },
]

describe('meditation-transcripts seed', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  let english: Meditation
  let french: Meditation
  let trashed: Meditation
  let replaced: Meditation

  /**
   * A meditation in the state this importer targets: a recording, and no
   * transcript row at all.
   *
   * ⚠ An upload writes one by itself since #953 —
   * `enqueueMeditationTranscription` asks for a transcription, and with no
   * `LEMONFOX_API_KEY` in this lane that request lands as a `failed`
   * placeholder carrying no cues. The 126 recordings this script imports were
   * uploaded before that hook existed and carry nothing, so a fixture keeping
   * the placeholder would assert against a state no target is in.
   */
  const createLibraryMeditation = async (overrides: FixtureOverrides<Meditation>) => {
    const meditation = await testData.createMeditation(payload, undefined, overrides)
    await payload.delete({
      collection: 'meditation-transcripts',
      where: { meditation: { equals: meditation.id } },
      overrideAccess: true,
    })
    return meditation
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    english = await createLibraryMeditation({ label: 'Om Meditation' })
    french = await createLibraryMeditation({ label: 'Meditation Francaise', locale: 'fr' })
    trashed = await createLibraryMeditation({ label: 'Retired Meditation' })
    replaced = await createLibraryMeditation({ label: 'Reuploaded Meditation' })

    // Trashing is setting `deletedAt` — `payload.delete` is a hard delete even
    // on a `trash: true` collection.
    await payload.update({
      collection: 'meditations',
      id: trashed.id,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  const readRow = async (meditationId: number) => {
    const { docs } = await payload.find({
      collection: 'meditation-transcripts',
      where: { meditation: { equals: meditationId } },
      depth: 0,
      overrideAccess: true,
    })
    return docs[0]
  }

  it('confirms the fixture names a real recording, unprefixed here', () => {
    // The test config's own storage arrangement, asserted rather than assumed:
    // if a plugin ever starts prefixing here, the entries above would name the
    // prefixed file and the strip would be asserted against itself.
    expect(english.filename).toBeTruthy()
    expect(english.filename).not.toContain(PREVIEW_ASSET_PREFIX)
  })

  it('writes a completed row whose phrases carry the corrected spelling', async () => {
    const probe = new TranscriptsProbe(payload, [
      entryFor(english, 'english', 'Let the kundalini rise through the fontanel bone area.'),
    ])
    await probe.drive()

    expect(probe.errorCount).toBe(0)

    const row = await readRow(english.id)
    expect(row.status).toBe('completed')
    expect(row.provider).toBe('lemonfox')
    expect(row.language).toBe('en')
    expect(row.error).toBeFalsy()
    expect(row.audioFilename).toBe(english.filename)
    // The hook's work, not the importer's: it never calls `applyGlossary`.
    expect(row.segments).toEqual(CORRECTED_FIRST_ROW)
  })

  it('finds the French meditation, which only a locale-wide read can see', async () => {
    const probe = new TranscriptsProbe(payload, [
      entryFor(french, 'french', 'Laissez la kundalini monter.'),
    ])
    await probe.drive()

    expect(probe.warnings).toEqual([])
    expect(probe.errorCount).toBe(0)
    const row = await readRow(french.id)
    expect(row.language).toBe('fr')
  })

  it('creates nothing on a second run, and reports no error', async () => {
    const entries = [entryFor(english, 'english', 'Something else entirely.')]
    const probe = new TranscriptsProbe(payload, entries)
    await probe.drive()

    expect(probe.errorCount).toBe(0)
    const row = await readRow(english.id)
    // Skip mode leaves the existing row alone, phrases included.
    expect(row.segments).toEqual(CORRECTED_FIRST_ROW)
  })

  it('re-writes the phrases in update mode, so a glossary change reaches them', async () => {
    const probe = new TranscriptsProbe(
      payload,
      [entryFor(english, 'english', 'The sahasrara is open.')],
      { updateMode: true },
    )
    await probe.drive()

    expect(probe.errorCount).toBe(0)
    const row = await readRow(english.id)
    expect(row.segments).toEqual([
      { content: 'The Sahasrara is open.', startTimeMs: 1720, endTimeMs: 2760 },
    ])
  })

  it('skips an unknown id, a trashed meditation and a replaced recording, one warning each', async () => {
    const unknownId = 9_000_001
    const probe = new TranscriptsProbe(payload, [
      { ...entryFor(english, 'english', 'Nobody.'), meditationId: unknownId },
      entryFor(trashed, 'english', 'Retired.'),
      { ...entryFor(replaced, 'english', 'Reuploaded.'), audioFilename: 'some-other-file.mp3' },
    ])
    await probe.drive()

    // Never an error: a non-zero error count reports the whole run as failed,
    // and four of the library's 126 entries are expected absences.
    expect(probe.errorCount).toBe(0)
    expect(probe.warnings).toHaveLength(3)
    expect(probe.warnings[0]).toContain(`Meditation ${unknownId}`)
    expect(probe.warnings[0]).toContain('no such meditation')
    expect(probe.warnings[1]).toContain('trashed')
    expect(probe.warnings[2]).toContain('some-other-file.mp3')

    expect(await readRow(unknownId)).toBeUndefined()
    expect(await readRow(trashed.id)).toBeUndefined()
    expect(await readRow(replaced.id)).toBeUndefined()
  })

  it('warns when the source language disagrees, and still imports', async () => {
    // The filename agrees, so the language name is the only disagreement.
    const probe = new TranscriptsProbe(payload, [entryFor(replaced, 'french', 'Imported anyway.')])
    await probe.drive()

    expect(probe.errorCount).toBe(0)
    expect(probe.warnings).toHaveLength(1)
    expect(probe.warnings[0]).toContain('transcribed as french, stored as en')
    expect((await readRow(replaced.id)).language).toBe('en')
  })

  it('writes nothing and reads no row in dry-run mode', async () => {
    const fresh = await createLibraryMeditation({ label: 'Dry Run Only' })
    const probe = new TranscriptsProbe(payload, [entryFor(fresh, 'english', 'Not stored.')], {
      dryRun: true,
    })
    await probe.drive()

    expect(probe.errorCount).toBe(0)
    expect(await readRow(fresh.id)).toBeUndefined()
  })

  it('refuses a duplicate id and a backwards range in dry-run mode', async () => {
    const entry = entryFor(english, 'english', 'Twice.')
    const probe = new TranscriptsProbe(
      payload,
      [
        entry,
        entry,
        {
          ...entryFor(french, 'french', 'Backwards.'),
          segments: [{ content: 'Backwards.', startTimeMs: 5000, endTimeMs: 1000 }],
        },
      ],
      { dryRun: true },
    )
    await probe.drive()

    expect(probe.errorCount).toBe(2)
  })

  it('matches through a preview prefix, which is how every non-production copy is named', async () => {
    const prefixed = await testData.createMeditation(payload, undefined, { label: 'Prefixed Copy' })
    const production = prefixed.filename ?? ''
    // Written straight to the column, the way `storeInvalidEvent` seeds a shape
    // no API path produces: no storage plugin runs here to prefix an upload, and
    // `payload.update` with `filename` alone materialises an empty `video` group
    // and is refused by its own frames validator.
    await payload.db.updateOne({
      collection: 'meditations',
      id: prefixed.id,
      data: { filename: `${PREVIEW_ASSET_PREFIX}${production}` },
    })

    // `prefixed` still holds the pre-update name, so the entry names the
    // unprefixed file while the row carries the prefixed one.
    const probe = new TranscriptsProbe(payload, [entryFor(prefixed, 'english', 'Matched.')])
    await probe.drive()

    expect(probe.warnings).toEqual([])
    expect(await readRow(prefixed.id)).toBeTruthy()
  })

  it('accounts for every entry, whichever way each one ended', async () => {
    const imported = await testData.createMeditation(payload, undefined, { label: 'Accounted' })
    const mismatched = await testData.createMeditation(payload, undefined, {
      label: 'Wrong Language',
    })

    const probe = new TranscriptsProbe(payload, [
      entryFor(imported, 'english', 'Written.'),
      // Imports, and warns about its language — which is why the invariant
      // cannot be `created + skipped + warnings === entries`: this entry
      // carries both a write and a warning.
      entryFor(mismatched, 'french', 'Written anyway.'),
      { ...entryFor(imported, 'english', 'Nobody.'), meditationId: 9_000_002 },
      entryFor(trashed, 'english', 'Retired.'),
    ])
    await probe.drive()

    expect(probe.warnings).toHaveLength(3)
    expect(await probe.verify()).toEqual({ failures: [] })
  })
})
