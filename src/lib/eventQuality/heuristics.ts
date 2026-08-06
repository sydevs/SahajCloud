/**
 * The text heuristics behind the listing-quality checks.
 *
 * These started life as one-off regexes inside `tests/unit/atlas-events-data.spec.ts`,
 * guarding the #605 grooming pass over the 511 legacy Atlas listings. That pass
 * was a migration; these are the same judgements made permanent, so the data
 * spec now imports them from here rather than keeping its own copies to drift.
 */
import { LOCALES } from '@/lib/locales'

/** A link anywhere in the text. Bare `www.` counts — it renders as dead text too. */
export const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"')]+/i

/** An email address anywhere in the text. */
export const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/

/**
 * A title that says nothing the auto-title doesn't already say, in the
 * languages the legacy listings actually used. Anchored: "Meditation" fails,
 * "Meditation for Nurses" passes — the qualifier is the whole point.
 */
export const GENERIC_TITLE_RE =
  /^(free\s+|weekly\s+|daily\s+|online\s+|open\s+)*(guided\s+)?(meditation|meditación|meditazione|meditatie|méditation|meditação|meditaatio|медитация)(\s+(class|classes|course|courses|session|sessions|workshop|meeting|cursus|corso|curso|taller|kurssi))?$/i

/**
 * A phone number in prose: 7+ digits, optionally grouped by the usual
 * separators. Requires a digit run long enough that a house number or a year
 * can't trip it.
 */
export const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/

/** A clock time — `19:00`, `7pm`, `7:30 PM`. Language-neutral, unlike weekdays. */
export const TIME_RE = /\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b|\b(?:1[0-2]|\d)\s?[ap]\.?m\.?\b/i

/** An ISO or slash-separated numeric date — `2024-03-12`, `12/03/2024`. */
const NUMERIC_DATE_RE =
  /\b(?:(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2})\b/

/**
 * The founding year of Sahaja Yoga. It shows up in listings as history, not as
 * a schedule, so it never counts as a stale date (#511).
 */
const NON_DATE_YEARS = new Set(['1970'])

/**
 * Weekday names in every locale the CMS runs in, lowercased.
 *
 * Derived from `Intl.DateTimeFormat` rather than hand-listed: the platform
 * already owns this data, and a table would go stale the moment a locale is
 * added. Only `long` forms are used, and only those of 4+ characters —
 * abbreviations like Turkish "Cum" collide with ordinary words often enough to
 * make the check useless.
 *
 * 2024-01-01 is a Monday, so adding 0–6 days walks a full week.
 */
const WEEKDAY_NAMES: string[] = (() => {
  const names = new Set<string>()
  for (const { code } of LOCALES) {
    let format: Intl.DateTimeFormat
    try {
      format = new Intl.DateTimeFormat(code, { weekday: 'long', timeZone: 'UTC' })
    } catch {
      continue
    }
    for (let day = 0; day < 7; day++) {
      const name = format
        .format(Date.UTC(2024, 0, 1 + day))
        .toLowerCase()
        .trim()
      if (name.length >= 4) names.add(name)
    }
  }
  return [...names]
})()

/** Escape a literal for embedding in a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `\b` is ASCII-only in JavaScript, so it won't anchor a Cyrillic or Greek
 * weekday. Bound on "not a letter" instead, via Unicode property escapes.
 */
const WEEKDAY_RE = new RegExp(
  `(?<!\\p{L})(?:${WEEKDAY_NAMES.map(escapeRegExp).join('|')})(?!\\p{L})`,
  'iu',
)

/** Whether the text names a weekday in any of the CMS's locales. */
export function containsWeekday(text: string): boolean {
  return WEEKDAY_RE.test(text)
}

/** Whether the text carries a clock time or a weekday — what `schedule` renders. */
export function containsScheduleInfo(text: string): boolean {
  return TIME_RE.test(text) || containsWeekday(text)
}

/** Whether the text carries a phone number or an email — what the contact fields render. */
export function containsContactInfo(text: string): boolean {
  return EMAIL_RE.test(text) || PHONE_RE.test(text)
}

/** Whether the text carries a link — it belongs in `website` / `onlineUrl`. */
export function containsUrl(text: string): boolean {
  return URL_RE.test(text)
}

/**
 * Years and dates in `text` that are already in the past, ignoring `1970`.
 * Returns the offending substrings so a caller can name them.
 *
 * `currentYear` is a parameter rather than read from the clock so the check
 * stays pure — the runtime passes today's year, and the Atlas data spec passes
 * the year the grooming pass was made against.
 */
export function findStaleDates(text: string, currentYear: number): string[] {
  const stale = (text.match(/\b(?:19|20)\d{2}\b/g) ?? []).filter(
    (year) => !NON_DATE_YEARS.has(year) && Number(year) < currentYear,
  )
  return [...stale, ...(text.match(NUMERIC_DATE_RE) ?? [])].filter(
    (match, index, all) => all.indexOf(match) === index,
  )
}

/**
 * Flatten a Lexical `richText` value to plain text.
 *
 * Sibling text nodes are joined with nothing so a formatting run inside a
 * sentence ("visit **our** centre") still reads as one phrase; block-level
 * nodes get a trailing newline so a heading can't run into the paragraph below
 * it and invent a phrase that was never written.
 */
export function lexicalPlainText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(lexicalPlainText).join('')
  if (typeof node !== 'object') return ''

  const obj = node as Record<string, unknown>
  if (typeof obj.text === 'string') return obj.text
  if (obj.root) return lexicalPlainText(obj.root)
  if (!Array.isArray(obj.children)) return ''

  const inner = lexicalPlainText(obj.children)
  const isBlock = obj.type !== 'text' && obj.type !== 'linebreak' && obj.type !== 'root'
  return isBlock ? `${inner}\n` : inner
}

/** Collapse whitespace and lowercase, for comparing a title to a field value. */
export function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Whether `haystack` contains `needle` as a whole phrase. Short needles are
 * refused: a two-letter city ("Ur") or a one-word venue ("Centre") matches far
 * too much ordinary prose to be evidence of anything.
 */
export function containsPhrase(haystack: string, needle: string): boolean {
  const trimmed = normalizeForComparison(needle)
  if (trimmed.length < 4) return false
  return new RegExp(`(?<!\\p{L})${escapeRegExp(trimmed)}(?!\\p{L})`, 'iu').test(
    normalizeForComparison(haystack),
  )
}
