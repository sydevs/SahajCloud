/**
 * `applyGlossary` — the one pass that decides how a Sahaja Yoga word is
 * spelled in a transcript (#897, success lines 7 and 8).
 *
 * Fixture pre-mortem: the cases below assume `glossary.json` is a flat array
 * of `{ heard, written, language }` whose `language` values are `LOCALES`
 * codes, and that `en` is the only language seeded today. Verified against
 * `src/collections/MeditationTranscripts/glossary.json` and
 * `src/lib/locales/index.ts`. The last `describe` asserts both rather than
 * trusting them.
 */
import { describe, expect, it } from 'vitest'

import { applyGlossary, GLOSSARY } from '@/collections/MeditationTranscripts/glossary'
import { LOCALES, type LocaleCode } from '@/lib/locales'

describe('applyGlossary', () => {
  it.each([
    ['the fontanel area', 'the fontanelle area'],
    ['the fentanyl bone', 'the fontanelle bone'],
    ['the kundalini rises', 'the Kundalini rises'],
    ['two bandhanas', 'two bandhans'],
    ['at the sahasrara', 'at the Sahasrara'],
    ['the anahata chakra', 'the Anahata chakra'],
    ['the swadhisthana', 'the Swadhisthana'],
  ])('rewrites %j to %j', (heard, written) => {
    expect(applyGlossary(heard, 'en')).toBe(written)
  })

  it('leaves an already-correct form alone, so the pass is idempotent', () => {
    const once = applyGlossary('the Kundalini reaches the Sahasrara through bandhans', 'en')

    expect(once).toBe('the Kundalini reaches the Sahasrara through bandhans')
    expect(applyGlossary(once, 'en')).toBe(once)
  })

  it.each([
    'the fontanelle area',
    'Raise the Kundalini.',
    'Anahat, Anahata, Swadhistan and Swadhisthana are all spellings we keep.',
    'nothing here is a glossary word',
  ])('is idempotent on %j', (text) => {
    expect(applyGlossary(applyGlossary(text, 'en'), 'en')).toBe(applyGlossary(text, 'en'))
  })

  it('keeps `fontanel` from matching inside `fontanelle`', () => {
    expect(applyGlossary('the fontanelle area', 'en')).toBe('the fontanelle area')
  })

  it('keeps `anahat` from matching inside `anahata`', () => {
    // Both are accepted transliterations, so the list fixes each one's capital
    // and never rewrites one into the other.
    expect(applyGlossary('anahat and anahata', 'en')).toBe('Anahat and Anahata')
  })

  it('matches a multi-word entry, and only whole words', () => {
    expect(applyGlossary('a sahaja yoga class', 'en')).toBe('a Sahaja Yoga class')
    expect(applyGlossary('unkundalinied', 'en')).toBe('unkundalinied')
  })

  it('applies no entry of another language', () => {
    // Success line 8. No French entry exists today, so a French transcript
    // must come back byte-identical rather than taking English's spellings.
    const french = 'la kundalini monte vers le sahasrara'

    expect(applyGlossary(french, 'fr')).toBe(french)
    expect(GLOSSARY.some((entry) => entry.language === 'fr')).toBe(false)
  })

  it('does not depend on the file’s row order', () => {
    const forwards = applyGlossary('kundalini sahasrara fontanel bandhanas', 'en')

    expect(forwards).toBe('Kundalini Sahasrara fontanelle bandhans')
    expect(applyGlossary('bandhanas fontanel sahasrara kundalini', 'en')).toBe(
      'bandhans fontanelle Sahasrara Kundalini',
    )
  })
})

describe('glossary.json', () => {
  const codes = new Set<string>(LOCALES.map((locale) => locale.code))

  it('parses, and is not empty', () => {
    expect(Array.isArray(GLOSSARY)).toBe(true)
    expect(GLOSSARY.length).toBeGreaterThan(10)
  })

  it('gives every entry a heard, a written and a LocaleCode language', () => {
    for (const entry of GLOSSARY) {
      expect(typeof entry.heard).toBe('string')
      expect(entry.heard.length).toBeGreaterThan(0)
      expect(typeof entry.written).toBe('string')
      expect(entry.written.length).toBeGreaterThan(0)
      expect(codes.has(entry.language)).toBe(true)
    }
  })

  it('names each heard form once per language', () => {
    const seen = new Set<string>()

    for (const entry of GLOSSARY) {
      const key = `${entry.language}:${entry.heard.toLowerCase()}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('settles every spelling the goal measured as wrong', () => {
    const written = (heard: string, language: LocaleCode = 'en') =>
      applyGlossary(heard, language)

    expect(written('fontanel')).toBe('fontanelle')
    expect(written('fentanyl')).toBe('fontanelle')
    expect(written('kundalini')).toBe('Kundalini')
    expect(written('bandhanas')).toBe('bandhans')
    expect(written('sahasrara')).toBe('Sahasrara')
    expect(written('anahata')).toBe('Anahata')
    expect(written('swadhisthana')).toBe('Swadhisthana')
  })
})
