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
 * ⚠ **An entry whose `written` is lower-case rewrites a sentence-initial
 * capital away**, because the match is case-insensitive. So a word already
 * written lower-case — `chakra`, `nadi`, `puja` — earns no entry, and nor does
 * `void`, the one subtle-system node label that is also an ordinary English
 * word.
 */
import { escapeRegExp } from '@/lib/eventQuality/heuristics'
import type { LocaleCode } from '@/lib/locales'

import glossaryData from './glossary.json' with { type: 'json' }

export type GlossaryEntry = { heard: string; written: string; language: LocaleCode }

export const GLOSSARY = glossaryData as GlossaryEntry[]

type Pass = { pattern: RegExp; written: Map<string, string> }

/** A language with no entries is absent, which is what makes the pass a no-op for it. */
const PASSES: ReadonlyMap<string, Pass> = buildPasses()

function buildPasses(): Map<string, Pass> {
  const byLanguage = new Map<string, Map<string, string>>()
  for (const entry of GLOSSARY) {
    const written = byLanguage.get(entry.language) ?? new Map<string, string>()
    written.set(entry.heard.toLowerCase(), entry.written)
    byLanguage.set(entry.language, written)
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
 * Only entries in `language` are considered, so one language's spellings never
 * reach another's transcript (#897, success line 8). Word boundaries keep
 * `fontanel` from matching inside `fontanelle`, which is what makes the pass
 * idempotent.
 */
export function applyGlossary(text: string, language: LocaleCode): string {
  const pass = PASSES.get(language)
  if (!pass) return text

  return text.replace(pass.pattern, (match) => pass.written.get(match.toLowerCase()) ?? match)
}
