/**
 * The checks on a parsed row that no `events` field can make: what a
 * spreadsheet does to a cell, which columns this `eventType` owes, and whether
 * the line is still the template's example. They run before the geocode, so a
 * row that cannot import spends no lookup.
 *
 * ⚠ **Never restate an Events rule here** — a `maxLength`, a URL or email
 * rule, a select's options. The built class goes through Payload's own field
 * validation (`../validate.ts`), which is where those are answered.
 */

import type { RawImportRow } from './columns'

import { z } from 'zod'

import { EVENT_TYPES, IMPORT_COLUMNS, requiredColumnsFor } from './columns'
import { isTemplateExampleRow } from './template'

/**
 * The characters that reorder what a reader sees: the explicit embedding and
 * override controls, the isolates, and the three bare marks. ⚠ Written as
 * escapes: the literal characters reorder this line itself in an editor.
 * ZWJ and ZWNJ are absent on purpose — Persian and the Indic locales spell
 * words with them.
 */
const BIDI_CONTROL_RE = /[؜‎‏‪-‮⁦-⁩]/

/**
 * A cell a spreadsheet would run as a formula when the published value is
 * exported and reopened. `+` and `-` count only before a function call or a
 * cell reference, so a phone number like `+49 30 123456` and a `-1` stay data.
 */
const FORMULA_RE =
  /^(?:[=@]|[+-]\s*(?:[A-Za-z_][\w.]*\s*\(|\$?[A-Za-z]{1,3}\$?\d+\s*(?:[-+*/^&]|$)))/

/** What Excel turns a long number into when the column is not formatted as text. */
const SCIENTIFIC_RE = /^[+-]?\d+(?:[.,]\d+)?E[+-]?\d+$/i

/** A value as a message quotes it: shortened, with invisible characters spelled out. */
export function echo(value: string): string {
  const visible = value.replace(
    /[\p{Cc}\p{Cf}]/gu,
    (char) => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`,
  )
  return visible.length > 60 ? `${visible.slice(0, 57)}…` : visible
}

/**
 * Issues as a volunteer reads them: the column, its message, and what the cell
 * held. ⚠ A pathless issue is the whole row's — the example-row refusal.
 */
export function messagesOf(issues: readonly z.core.$ZodIssue[], values: RawImportRow): string[] {
  return issues.map(({ message, path }) => {
    if (!path.length) return message
    const column = String(path[0])
    const got = values[column]
    return got ? `${column} ${message} (got "${echo(got)}")` : `${column} ${message}`
  })
}

const cell = z
  .string()
  .refine((value) => !BIDI_CONTROL_RE.test(value), {
    message:
      'contains an invisible text-direction character that makes it display differently from what was typed — retype it',
  })
  .refine((value) => !FORMULA_RE.test(value), {
    message: 'starts like a spreadsheet formula — remove the leading character',
  })

const COLUMN_CELLS: Record<string, z.ZodType<string>> = {
  contactPhone: cell.refine((value) => !SCIENTIFIC_RE.test(value), {
    message:
      'was turned into scientific notation by the spreadsheet — format the column as text and type the number again',
  }),
  // `managerEmail` names a manager account, not an `events` field.
  managerEmail: cell.pipe(z.email({ error: 'must be one email address, like name@example.org' })),
  registrationLimit: cell.regex(
    /^[1-9]\d{0,5}$/,
    'must be a whole number of places, 1 or more — blank for unlimited',
  ),
}

/**
 * ⚠ **Blank cells are left out before the cell checks**, which they owe none
 * of; the row rules below decide whether a blank was allowed.
 */
const rowSchema = z
  .object(
    Object.fromEntries(
      IMPORT_COLUMNS.map(({ name }) => [name, (COLUMN_CELLS[name] ?? cell).optional()]),
    ),
  )
  .superRefine((filled, ctx) => {
    const eventType = filled.eventType?.toLowerCase()
    if (eventType && !(EVENT_TYPES as readonly string[]).includes(eventType)) {
      ctx.addIssue({
        code: 'custom',
        path: ['eventType'],
        message: `must be ${EVENT_TYPES.join(' or ')}`,
      })
    }
    for (const name of requiredColumnsFor(eventType)) {
      if (!filled[name]) ctx.addIssue({ code: 'custom', path: [name], message: 'is required' })
    }
  })

/** Every reason the row cannot import, before anything is looked up. */
export function checkRowFields(values: RawImportRow): string[] {
  // A volunteer who typed `Offline` made no mistake worth a refusal.
  if (values.eventType) values.eventType = values.eventType.toLowerCase()
  const filled = Object.fromEntries(Object.entries(values).filter(([, value]) => value))
  const parsed = rowSchema.safeParse(filled)
  const errors = parsed.success ? [] : messagesOf(parsed.error.issues, values)
  // Against the row with its blanks: a blank cell is compared, not skipped.
  if (isTemplateExampleRow(values)) {
    errors.push(
      `this is the template's example row — delete it, or replace it with one of your classes (got title "${echo(values.title ?? '')}")`,
    )
  }
  return errors
}
