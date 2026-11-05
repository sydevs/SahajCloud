/**
 * `applyGlossary` — the one pass that decides how a Sahaja Yoga word is
 * spelled in a transcript (#897, success lines 7 and 8).
 *
 * Fixture pre-mortem: the cases below assume `glossary.json` is a flat array
 * of `{ heard, written, language }` whose `language` is a list of base
 * languages — `en`, never `en-AU` — and that every entry names `en` and none
 * names `ru`. The prompt cases assume one more: every entry names `pt` as well
 * as `en`, so the two languages' prompts are the same string. Verified against
 * `src/collections/MeditationTranscripts/glossary.json` and
 * `src/lib/locales/index.ts`. The `glossary.json` `describe` asserts the shape
 * rather than trusting it.
 */
import { describe, expect, it } from 'vitest'

import {
  applyGlossary,
  GLOSSARY,
  glossaryPrompt,
} from '@/collections/MeditationTranscripts/glossary'
import { baseLanguage, LOCALES } from '@/lib/locales'

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

  it.each([
    ['at the muladhara', 'at the Mooladhara'],
    ['the condalini rises', 'the Kundalini rises'],
    ['the kundalinee rises', 'the Kundalini rises'],
    ['the svadhisthana', 'the Swadhisthana'],
    ['the ajna chakra', 'the Agnya chakra'],
  ])('rewrites the IAST form %j to %j', (heard, written) => {
    // What a request carrying no prompt wrote (#1084). The prompt makes these
    // less likely; this pass is what guarantees they never reach a reader.
    expect(applyGlossary(heard, 'en')).toBe(written)
  })

  it.each([
    ['the manipura', 'the Manipura'],
    ['the vishuddha', 'the Vishuddha'],
  ])('capitalises the classical name %j without renaming it, giving %j', (heard, written) => {
    // A narrator saying "Manipura" said Manipura, not Nabhi — a rename here
    // would impose a terminology choice nobody made, as `anahat`/`anahata`
    // already shows for a spelling.
    expect(applyGlossary(heard, 'en')).toBe(written)
    expect(applyGlossary(written, 'en')).toBe(written)
  })

  it('leaves the house form each classical name sits beside alone', () => {
    expect(applyGlossary('Nabhi, Vishuddhi and Agnya', 'en')).toBe('Nabhi, Vishuddhi and Agnya')
  })

  it('leaves an already-correct form alone, so the pass is idempotent', () => {
    const once = applyGlossary('the Kundalini reaches the Sahasrara through bandhans', 'en')

    expect(once).toBe('the Kundalini reaches the Sahasrara through bandhans')
    expect(applyGlossary(once, 'en')).toBe(once)
  })

  it.each([
    ['the fontanelle area', 'the fontanelle area'],
    ['Raise the Kundalini.', 'Raise the Kundalini.'],
    [
      'anahat, anahata, swadhistan and swadhisthana',
      'Anahat, Anahata, Swadhistan and Swadhisthana',
    ],
    ['nothing here is a glossary word', 'nothing here is a glossary word'],
  ])('settles %j at %j and stays there', (text, settled) => {
    // Pinned against a literal, not a recomputation: comparing `f(f(x))` to
    // `f(x)` alone would pass for an `applyGlossary` that returned its input.
    expect(applyGlossary(text, 'en')).toBe(settled)
    expect(applyGlossary(settled, 'en')).toBe(settled)
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

  it.each([
    ['Fontanel bone', 'Fontanelle bone'],
    ['Bandhanas help', 'Bandhans help'],
    ['Chakra by chakra', 'Chakra by chakra'],
    ['Vibrations flow', 'Vibrations flow'],
  ])('keeps the capital %j already carries, giving %j', (heard, written) => {
    // Without this the lower-case `written` of a vocabulary-record entry would
    // rewrite a sentence opening to lower case (#952 §5, review round two).
    expect(applyGlossary(heard, 'en')).toBe(written)
  })

  it('applies no entry to a language none of them names', () => {
    // Success line 8. A Latin `Sahasrara` is wrong for Russian, which wants
    // its own script, so no entry claims `ru` and a Russian transcript must
    // come back byte-identical.
    const russian = 'kundalini sahasrara'

    expect(applyGlossary(russian, 'ru')).toBe(russian)
    expect(GLOSSARY.some((entry) => entry.language.includes('ru'))).toBe(false)
  })

  it.each([
    ['en-AU', 'at the sahasrara', 'at the Sahasrara'],
    ['pt-BR', 'a kundalini sobe', 'a Kundalini sobe'],
  ] as const)('corrects a %s transcript through its base language', (locale, heard, written) => {
    // `en` covers every `en-*`, so no entry names a region. Without the
    // reduction in `applyGlossary` an Australian transcript takes no pass at
    // all, which is the silent skip a required `language` exists to prevent.
    expect(applyGlossary(heard, locale)).toBe(written)
  })

  it('corrects a Latin-script language the same way as English', () => {
    // The point of the list: these are Sanskrit words, so French wants the
    // same spelling English does rather than nothing at all.
    expect(applyGlossary('la kundalini monte vers le sahasrara', 'fr')).toBe(
      'la Kundalini monte vers le Sahasrara',
    )
    expect(applyGlossary('two bandhanas', 'nl')).toBe('two bandhans')
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
  const languages = new Set<string>(LOCALES.map((locale) => baseLanguage(locale.code)))

  it('is not empty, so the cases above are not vacuous', () => {
    expect(GLOSSARY.length).toBeGreaterThan(10)
  })

  it('gives every entry a heard, a written and at least one base language', () => {
    for (const entry of GLOSSARY) {
      expect(typeof entry.heard).toBe('string')
      expect(entry.heard.length).toBeGreaterThan(0)
      expect(typeof entry.written).toBe('string')
      expect(entry.written.length).toBeGreaterThan(0)
      // An empty list is an entry that corrects nothing, which reads as a
      // working entry in the file and is a silent no-op in the pass.
      expect(entry.language.length).toBeGreaterThan(0)
      for (const language of entry.language) {
        expect(languages.has(language)).toBe(true)
        // A region here holds for one variant and silently leaves its
        // siblings uncorrected, so the file may not spell one.
        expect(language).not.toContain('-')
      }
      expect(new Set(entry.language).size).toBe(entry.language.length)
    }
  })

  it('carries every word #952 §5 names, correction or record', () => {
    const heard = new Set(GLOSSARY.map((entry) => entry.heard))

    // The five already written lower-case are inert passes today. They are the
    // vocabulary record, and the capital rule above is what makes them safe.
    for (const word of ['chakra', 'nadi', 'bandhan', 'puja', 'vibrations']) {
      expect(heard.has(word)).toBe(true)
    }
  })

  it('gives every chakra name #1084 reviewed a heard form', () => {
    const heard = new Set(GLOSSARY.map((entry) => entry.heard))

    for (const word of ['svadhisthana', 'manipura', 'anahata', 'vishuddha', 'ajna', 'sahasrara']) {
      expect(heard.has(word), word).toBe(true)
    }
  })

  it('names each heard form once per language', () => {
    // Two entries claiming one language for the same heard word make the pass
    // depend on row order, which the alternation is built to avoid.
    const seen = new Set<string>()

    for (const entry of GLOSSARY) {
      for (const language of entry.language) {
        const key = `${language}:${entry.heard.toLowerCase()}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
  })
})

describe('glossaryPrompt', () => {
  const english = glossaryPrompt('en')

  it('names our own spellings, not the forms they correct', () => {
    expect(english).toContain('Mooladhara')
    expect(english).toContain('Kundalini')
    expect(english).toContain('Sahasrara')
    // The prompt tells the vendor what to write, so a heard form in it would
    // ask for the misspelling this list exists to replace.
    expect(english).not.toContain('muladhara')
    expect(english).not.toContain('condalini')
  })

  it('names each spelling once, however many forms correct to it', () => {
    // `kundalini`, `condalini` and `kundalinee` all write `Kundalini`.
    expect(english?.match(/Kundalini/g)).toHaveLength(1)
  })

  it('carries today’s whole list, so nothing is silently cut', () => {
    // The cap bounds a list that grows; it fires on nothing today. When this
    // fails the list has outgrown the window and the cap dropped its tail —
    // decide what to leave out rather than raising the cap.
    for (const entry of GLOSSARY.filter((row) => row.language.includes('en'))) {
      expect(english, entry.written).toContain(entry.written)
    }
  })

  it('stays inside the prompt window', () => {
    // 224 tokens at the two-characters-per-token floor `glossary.ts` states.
    expect(english?.length).toBeLessThanOrEqual(448)
  })

  it('answers nothing for a language no entry claims', () => {
    // Russian wants its own script, so there is no prompt to send — the same
    // condition under which the pass is a no-op.
    expect(glossaryPrompt('ru')).toBeUndefined()
  })

  it('answers a regional locale through its base language', () => {
    // No entry names a region, so without the reduction both are undefined.
    expect(glossaryPrompt('en-AU')).toBe(english)
    expect(glossaryPrompt('pt-BR')).toBe(english)
  })
})
