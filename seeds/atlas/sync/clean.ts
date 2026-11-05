/**
 * The mechanical half of grooming — the classes of junk the #605 pass removed
 * by rule rather than by judgement (seeds/atlas/AGENTS.md, "The grooming pass",
 * class 5). `groom` runs it over the worksheet rows only, before the hand-written
 * patch, so a person spends their attention on wording, never on whitespace.
 */

/** U+2800 braille blanks (VK padding), zero-width spaces and joiners, the BOM. */
const INVISIBLE = /[⠀​‌﻿]/g
/** A zero-width joiner is junk unless it joins two emoji, as in 🧘‍♂️. */
const STRAY_ZWJ = /(?<![\p{Extended_Pictographic}️])‍|‍(?![\p{Extended_Pictographic}])/gu

/** Normalize one free-text value. An empty result is `null`, never `''`. */
export function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return (value as null) ?? null
  const text = value
    .replace(INVISIBLE, '')
    .replace(STRAY_ZWJ, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    // Line breaks written as HTML become line breaks; any other tag is dropped.
    .replace(/<br\s*\/?>|<\/br>/gi, '\n')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text === '' ? null : text
}

/** Drop blank contact values; an object with nothing left is `null`. */
export function cleanContactInfo(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object') return null
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const text = cleanText(raw)
    if (text) out[key] = text
  }
  return Object.keys(out).length ? out : null
}

export const CLEANED_TEXT_FIELDS = ['customName', 'room', 'description'] as const

/** The mechanical clean of one event row, returned as a new row. */
export function cleanEventRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row }
  for (const field of CLEANED_TEXT_FIELDS) out[field] = cleanText(row[field])
  out.contactInfo = cleanContactInfo(row.contactInfo)
  return out as T
}

/** Whether a value still carries what `cleanText` removes as invisible junk. */
export function hasInvisibleJunk(value: string): boolean {
  return new RegExp(INVISIBLE.source).test(value) || new RegExp(STRAY_ZWJ.source, 'u').test(value)
}
