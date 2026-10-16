/**
 * Guards `seeds/meditation-transcripts/data.json` — the library's 126 existing
 * transcripts, converted once by `generate.ts` from the files on
 * `proposal/897-transcripts`.
 *
 * These are data assertions. The file is committed, the branch it came from
 * never merges, and nothing but this spec stands between a re-generation and a
 * silently different corpus.
 *
 * The spelling block is where "the corrected spellings come out right" is
 * proven, because it needs no database: the collection applies `applyGlossary`
 * in a `beforeChange` hook, and the same pass over the same phrases here gives
 * the same answer the import will store.
 */
import type { TranscriptEntry } from '../../seeds/meditation-transcripts/import'

import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { applyGlossary } from '@/collections/MeditationTranscripts/glossary'
import { getLocaleLabel, LOCALES, type LocaleCode } from '@/lib/locales'
import { transcriptSegmentsSchema } from '@/lib/meditations/transcript'

import { MEDITATION_TRANSCRIPTS_DATA_FILE, SCRIPT_DATA_FILES } from '../../seeds/lib/dataFiles'

const DATA_PATH = path.resolve(process.cwd(), MEDITATION_TRANSCRIPTS_DATA_FILE)
const raw = readFileSync(DATA_PATH, 'utf-8')
const entries: TranscriptEntry[] = JSON.parse(raw)

/** The source's own language name back to a configured locale, as the importer compares them. */
const LOCALE_BY_LANGUAGE_NAME = new Map<string, LocaleCode>(
  LOCALES.map(({ code }) => [getLocaleLabel(code).toLowerCase(), code]),
)

const localeOf = (entry: TranscriptEntry): LocaleCode => {
  const locale = LOCALE_BY_LANGUAGE_NAME.get(entry.language)
  if (!locale) throw new Error(`No configured locale is labelled "${entry.language}".`)
  return locale
}

const phrases = entries.flatMap((entry) =>
  entry.segments.map((segment) => ({ content: segment.content, locale: localeOf(entry) })),
)

/**
 * Whole-word and case-sensitive, spelled the way the pass itself anchors a
 * match — JavaScript's `\b` is ASCII-only, so it would not anchor every word a
 * glossary entry can carry.
 */
const countWord = (texts: string[], word: string): number => {
  const pattern = new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'gu')
  return texts.reduce((total, text) => total + (text.match(pattern)?.length ?? 0), 0)
}

describe('meditation transcripts data file', () => {
  it('holds one entry per source file, each on a distinct meditation', () => {
    expect(entries).toHaveLength(126)
    expect(new Set(entries.map((entry) => entry.meditationId)).size).toBe(entries.length)
    for (const entry of entries) {
      expect(Number.isInteger(entry.meditationId)).toBe(true)
      expect(entry.meditationId).toBeGreaterThan(0)
      expect(entry.audioFilename).toMatch(/\.\w+$/)
    }
  })

  it('names one provider and only languages this CMS is configured for', () => {
    expect(new Set(entries.map((entry) => entry.provider))).toEqual(new Set(['lemonfox']))
    expect(new Set(entries.map((entry) => entry.language))).toEqual(new Set(['english', 'french']))
  })

  it('carries stored cues and nothing else — no word timings anywhere', () => {
    for (const entry of entries) {
      expect(transcriptSegmentsSchema.safeParse(entry.segments).success).toBe(true)
      for (const segment of entry.segments) {
        // Beyond the schema, which admits an optional `durationMs` the
        // conversion must not invent.
        expect(Object.keys(segment).sort()).toEqual(['content', 'endTimeMs', 'startTimeMs'])
        expect(segment.startTimeMs).toBeLessThanOrEqual(segment.endTimeMs)
      }
    }
    // The strict segment schema already refuses the key. Asserted over the raw
    // text too, because 86,571 word timings were 85% of the source's bytes and
    // a re-generation that kept them is the regression worth catching.
    expect(raw).not.toContain('"words"')
  })

  it('stays well under the size a seed file is uploaded at', () => {
    expect(statSync(DATA_PATH).size).toBeLessThan(1.1 * 1024 * 1024)
  })

  it('is registered for upload under the path the importer loads', () => {
    // One definition, so the CLI and the importer cannot disagree — spelled
    // differently, the script works locally and imports nothing in production.
    expect(SCRIPT_DATA_FILES['meditation-transcripts']).toEqual([MEDITATION_TRANSCRIPTS_DATA_FILE])
  })

  describe('the glossary corrects the corpus', () => {
    const corrected = phrases.map(({ content, locale }) => applyGlossary(content, locale))

    it('leaves no misheard spelling behind', () => {
      for (const word of [
        'fontanel',
        'fentanyl',
        'kundalini',
        'sahasrara',
        'anahata',
        'swadhisthana',
        'bandhanas',
      ]) {
        expect(countWord(corrected, word), word).toBe(0)
      }
    })

    it('writes each one the way the list names it', () => {
      expect(countWord(corrected, 'fontanelle')).toBe(49)
      expect(countWord(corrected, 'bandhans')).toBe(7)
      expect(countWord(corrected, 'Kundalini')).toBe(819)
    })

    it('had something to correct', () => {
      // Without this the block above passes on a corpus that never held the
      // misheard spellings — the vacuous green this ticket's own measurements
      // exist to rule out.
      const source = phrases.map(({ content }) => content)
      expect(countWord(source, 'fontanel')).toBe(38)
      expect(countWord(source, 'fontanelle')).toBe(10)
      expect(countWord(source, 'fentanyl')).toBe(1)
      expect(countWord(source, 'kundalini')).toBe(161)
      expect(countWord(source, 'Kundalini')).toBe(658)
      expect(countWord(source, 'bandhanas')).toBe(1)
      expect(countWord(source, 'bandhans')).toBe(6)
    })

    it('returns the French entry byte-identical', () => {
      // ⚠ Not because the list refuses French: every entry names `fr`, so a
      // French phrase is corrected like an English one. These 22 phrases simply
      // carry none of the 23 glossary words.
      const french = entries.filter((entry) => entry.language === 'french')
      expect(french).toHaveLength(1)
      for (const segment of french[0].segments) {
        expect(applyGlossary(segment.content, 'fr')).toBe(segment.content)
      }
    })
  })
})
