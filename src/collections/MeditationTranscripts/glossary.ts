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
 * capital away**, because the match is case-insensitive. So the list carries
 * no entry that merely records an already-lower-case word: `chakra`, `nadi`,
 * `bandhan`, `puja` and `vibrations` need no correction, and an entry for each
 * would lowercase every sentence that opens with one. `void` is left out for
 * the same reason from the other direction — it is the one subtle-system node
 * label that is also an ordinary English word.
 */
import type { LocaleCode } from '@/lib/locales'

import glossaryData from './glossary.json' with { type: 'json' }

export type GlossaryEntry = { heard: string; written: string; language: LocaleCode }

export const GLOSSARY = glossaryData as GlossaryEntry[]

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type Pass = { pattern: RegExp; written: Map<string, string> }

const passes = new Map<string, Pass | null>()

function passFor(language: LocaleCode): Pass | null {
  if (passes.has(language)) return passes.get(language) ?? null

  const entries = GLOSSARY.filter((entry) => entry.language === language)
  if (entries.length === 0) {
    passes.set(language, null)
    return null
  }

  const written = new Map(entries.map((entry) => [entry.heard.toLowerCase(), entry.written]))
  // Longest first, so one alternation is one pass: no replacement's output can
  // feed another's input, and the answer does not depend on the file's order.
  const heard = [...written.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp)

  const pass = { pattern: new RegExp(`\\b(?:${heard.join('|')})\\b`, 'gi'), written }
  passes.set(language, pass)
  return pass
}

/**
 * Rewrite every glossary word in `text` to the spelling the list names.
 *
 * Only entries in `language` are considered, so one language's spellings never
 * reach another's transcript (#897, success line 8) — a language with no
 * entries comes back byte-identical. Word boundaries keep `fontanel` from
 * matching inside `fontanelle`, which is what makes the pass idempotent.
 */
export function applyGlossary(text: string, language: LocaleCode): string {
  const pass = passFor(language)
  if (!pass) return text

  return text.replace(pass.pattern, (match) => pass.written.get(match.toLowerCase()) ?? match)
}
