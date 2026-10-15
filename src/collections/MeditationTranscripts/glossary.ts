/**
 * The one word list that decides how a Sahaja Yoga word is spelled in a
 * transcript, and the pure pass that applies it.
 *
 * `glossary.json` beside this file is the list — plain data, no code around
 * it, so anyone with a GitHub account can propose a change (#897).
 *
 * ⚠ **The list settles capitalisation and endings, never transliteration.**
 * `Anahat` and `Anahata` are both accepted spellings and both appear; an entry
 * rewriting one into the other would impose a choice nobody made.
 *
 * ⚠ **A match that already starts with a capital keeps it.** The match is
 * case-insensitive, so without that rule an entry whose `written` is
 * lower-case would rewrite a sentence-initial `Chakra` to `chakra`. It is what
 * lets a word already written lower-case carry an entry at all, and those
 * entries are the vocabulary record (#952 §5) rather than a correction.
 *
 * ⚠ **An entry names the languages it holds for, not one.** These are Sanskrit
 * words, so the same spelling is wanted in every language written in Latin
 * script — but `Sahasrara` is wrong for ru, uk, bg, el, hy and fa, which want
 * their own script. A list lets a Cyrillic entry sit beside the Latin one
 * instead of competing with it (#957).
 *
 * ⚠ **A language, never a locale: `en` covers `en-AU`, `pt` covers `pt-BR`.**
 * Spelling belongs to the language, so a regional entry would hold for one
 * variant and leave its siblings uncorrected. `BaseLanguage` makes the
 * regional code unrepresentable, and the pass reduces the transcript's locale
 * before it looks up (#957).
 *
 * ⚠ **`void` still earns no entry.** The rule above answers an entry that
 * strips a capital, never one that adds one, and `void` is the one
 * subtle-system node label that is also an ordinary English word.
 */
import { escapeRegExp } from '@/lib/eventQuality/heuristics'
import type { BaseLanguage, LocaleCode } from '@/lib/locales'
import { baseLanguage } from '@/lib/locales'

import glossaryData from './glossary.json' with { type: 'json' }

export type GlossaryEntry = { heard: string; written: string; language: BaseLanguage[] }

export const GLOSSARY = glossaryData as GlossaryEntry[]

type Pass = { pattern: RegExp; written: Map<string, string> }

/** A language with no entries is absent, which is what makes the pass a no-op for it. */
const PASSES: ReadonlyMap<BaseLanguage, Pass> = buildPasses()

function buildPasses(): Map<BaseLanguage, Pass> {
  const byLanguage = new Map<BaseLanguage, Map<string, string>>()
  for (const entry of GLOSSARY) {
    for (const language of entry.language) {
      const written = byLanguage.get(language) ?? new Map<string, string>()
      written.set(entry.heard.toLowerCase(), entry.written)
      byLanguage.set(language, written)
    }
  }

  return new Map(
    [...byLanguage].map(([language, written]) => {
      // Longest first, so one alternation is one pass: no replacement's output
      // can feed another's input, and the answer does not depend on row order.
      const heard = [...written.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp)
      // `\b` is ASCII-only in JavaScript, so it would never anchor a Cyrillic
      // or Greek entry — the same reason `containsPhrase` spells it this way.
      const pattern = new RegExp(`(?<!\\p{L})(?:${heard.join('|')})(?!\\p{L})`, 'giu')
      return [language, { pattern, written }]
    }),
  )
}

/**
 * Rewrite every glossary word in `text` to the spelling the list names.
 *
 * Only entries naming the locale's own language are considered, so a spelling
 * never reaches a transcript whose entry does not claim it (#897, success line
 * 8). Word boundaries keep `fontanel` from matching inside `fontanelle`, which
 * is what makes the pass idempotent.
 */
export function applyGlossary(text: string, language: LocaleCode): string {
  const pass = PASSES.get(baseLanguage(language))
  if (!pass) return text

  return text.replace(pass.pattern, (match) => {
    const written = pass.written.get(match.toLowerCase())
    if (written === undefined) return match
    return /^\p{Lu}/u.test(match) ? written.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : written
  })
}
