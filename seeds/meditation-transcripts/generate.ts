/**
 * One-shot converter from the library's existing transcript files to the
 * committed `data.json` this script imports.
 *
 * The 126 source files live on `proposal/897-transcripts`, which is reference
 * and never merges — only its data enters this repository, through here. Each
 * source file is a Lemonfox `verbose_json` body: phrases in seconds, with word
 * timings nothing stores.
 *
 * Usage:
 *   mkdir -p /tmp/897-transcripts
 *   git archive origin/proposal/897-transcripts seeds/meditation-transcripts \
 *     | tar -x -C /tmp/897-transcripts --strip-components=2
 *   pnpm tsx seeds/meditation-transcripts/generate.ts /tmp/897-transcripts
 */
import type { TranscriptEntry } from './import'

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { normalizeLemonfoxResponse } from '@/collections/MeditationTranscripts/lemonfox'

const OUT_PATH = path.resolve(process.cwd(), 'seeds/meditation-transcripts/data.json')

function main(): void {
  const sourceDir = process.argv[2]
  if (!sourceDir) {
    console.error('Usage: pnpm tsx seeds/meditation-transcripts/generate.ts <source-dir>')
    process.exit(1)
  }

  const files = readdirSync(sourceDir)
    .filter((name) => name.endsWith('.json'))
    .sort()

  const entries: TranscriptEntry[] = files.map((name) => {
    const raw = JSON.parse(readFileSync(path.join(sourceDir, name), 'utf-8'))
    // The id inside each file agrees with its own filename on all 126. Reading
    // the key and checking it against the stem makes a renamed or re-numbered
    // source file an error here, rather than a transcript silently reassigned
    // to another meditation.
    const stem = Number(path.basename(name, '.json'))
    if (raw.meditationId !== stem) {
      throw new Error(`${name}: meditationId ${raw.meditationId} is not the filename's own stem.`)
    }

    return {
      meditationId: raw.meditationId,
      audioFilename: raw.audioFilename,
      language: raw.language,
      provider: raw.provider,
      // The same normaliser the live transcription calls, so one definition of
      // "what a phrase is" serves both, and the word timings are dropped by the
      // code that will drop them at runtime.
      segments: normalizeLemonfoxResponse(raw),
    }
  })

  entries.sort((a, b) => a.meditationId - b.meditationId)

  writeFileSync(OUT_PATH, `${JSON.stringify(entries, null, 2)}\n`)

  const phrases = entries.reduce((total, entry) => total + entry.segments.length, 0)
  console.log(`Wrote ${entries.length} entries (${phrases} phrases) to ${OUT_PATH}`)
}

main()
