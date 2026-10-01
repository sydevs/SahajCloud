/**
 * The downloadable CSV template, generated from `IMPORT_COLUMNS`.
 *
 * Generated rather than committed so a renamed or added column cannot ship a
 * template the parser refuses — the whole reason the column spec is one
 * constant (`columns.ts`).
 */

import { IMPORT_COLUMNS, type ColumnRequirement } from './columns'

/** What the help row prints before each column's own help text. */
const REQUIREMENT_PREFIX: Record<ColumnRequirement, string> = {
  always: 'REQUIRED. ',
  offline: 'Required for offline. ',
  online: 'Required for online. ',
  optional: '',
}

/**
 * RFC 4180 quoting: wrap in quotes when the value carries a delimiter, a quote
 * or a newline, and double any quote inside. Every help string here is ours,
 * but the example values are edited by hand often enough that the escape
 * belongs in code rather than in a convention.
 */
function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function row(values: readonly string[]): string {
  return values.map(quote).join(',')
}

/**
 * Header row, a commented help row, and one example row.
 *
 * ⚠ **The help row is prefixed with `#` and the parser skips it.** A plain
 * second header row would have to be deleted before upload, and a volunteer
 * who forgets reads "row 1 is invalid" about instructions we wrote.
 */
export function buildImportTemplate(): string {
  const header = IMPORT_COLUMNS.map(({ name }) => name)
  const help = IMPORT_COLUMNS.map(
    ({ requirement, help: text }, index) =>
      `${index === 0 ? '# ' : ''}${REQUIREMENT_PREFIX[requirement]}${text}`,
  )
  const example = IMPORT_COLUMNS.map(({ example: value }) => value)

  return `${[row(header), row(help), row(example)].join('\n')}\n`
}

export const IMPORT_TEMPLATE_FILENAME = 'sahaj-atlas-event-import-template.csv'
