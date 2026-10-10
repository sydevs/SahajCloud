/**
 * The downloadable CSV template, generated from `IMPORT_COLUMNS`.
 *
 * Generated rather than committed so a renamed or added column cannot ship a
 * template the parser refuses — the whole reason the column spec is one
 * constant (`columns.ts`).
 */

import { stringify } from 'csv-stringify/sync'

import { IMPORT_COLUMNS, type ColumnRequirement, type RawImportRow } from './columns'

/** What the help row prints before each column's own help text. */
const REQUIREMENT_PREFIX: Record<ColumnRequirement, string> = {
  always: 'REQUIRED. ',
  offline: 'Required for offline. ',
  online: 'Required for online. ',
  optional: '',
}

/**
 * ⚠ Excel opens a CSV without a byte-order mark in the system's legacy code
 * page, so every `ß` in the template reads as `ÃŸ` — and is saved back that way.
 */
const UTF8_BOM = '\uFEFF'

const HELP_TEXTS = IMPORT_COLUMNS.map(
  ({ requirement, help }) => `${REQUIREMENT_PREFIX[requirement]}${help}`,
)
const HELP_TEXT_SET: ReadonlySet<string> = new Set(HELP_TEXTS.filter(Boolean))

/**
 * Header row, a commented help row, and one example row.
 *
 * ⚠ **The help row is prefixed with `#` and the parser skips it.** A plain
 * second header row would have to be deleted before upload, and a volunteer
 * who forgets reads "row 1 is invalid" about instructions we wrote.
 */
export function buildImportTemplate(): string {
  const header = IMPORT_COLUMNS.map(({ name }) => name)
  const help = HELP_TEXTS.map((text, index) => `${index === 0 ? '# ' : ''}${text}`)
  const example = IMPORT_COLUMNS.map(({ example: value }) => value)

  return `${UTF8_BOM}${stringify([header, help, example])}`
}

/**
 * Whether a record is the template's help row.
 *
 * ⚠ **Matched on our own help strings, not on a leading `#`.** A `#` is how a
 * real class can start (`#1 Beginners Class`, `#204-1234 Main St`), and
 * skipping on it dropped those rows without a word. Every filled cell must be
 * one of the strings we wrote, in any order, so a reordered sheet still matches
 * and a help row from an older template falls through to visible row errors.
 */
export function isTemplateHelpRow(record: readonly string[]): boolean {
  let matched = false
  for (const cell of record) {
    const text = cell?.trim().replace(/^#\s*/, '')
    if (!text) continue
    if (!HELP_TEXT_SET.has(text)) return false
    matched = true
  }
  return matched
}

/**
 * Whether a row is the template's example, left in.
 *
 * Reported rather than skipped: it parses as a valid class, and importing it
 * would publish a class nobody runs and invite its made-up coordinator. Every
 * column the example fills and the file carries must match, so a row edited
 * into a real class is not caught by it.
 */
export function isTemplateExampleRow(values: RawImportRow): boolean {
  let compared = 0
  for (const { name, example } of IMPORT_COLUMNS) {
    if (!example || !(name in values)) continue
    if (values[name]?.toLowerCase() !== example.toLowerCase()) return false
    compared += 1
  }
  return compared > 0
}

export const IMPORT_TEMPLATE_FILENAME = 'sahaj-atlas-event-import-template.csv'
