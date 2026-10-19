/**
 * Per-value checks on a parsed row.
 *
 * ⚠ **Run here because the import creates drafts, and a draft save skips
 * validation.** Without this pass a bad value would surface at the publish,
 * long after the volunteer has put the spreadsheet away.
 *
 * ⚠ **The Events field validators are called, not restated.** Each column is
 * looked up in the `Events` config and its own `validate` (or the default
 * Payload installs for its type) is run against the value, so a changed
 * `maxLength` or a tightened URL rule is enforced here the day it lands. A
 * field that disappears throws at import, which fails every spec that loads
 * the parser rather than letting this check go quietly inert.
 *
 * ⚠ **Zod owns the spreadsheet half, the Events config owns the value half.**
 * `importRowSchema` carries what no `events` field can know — what Excel does
 * to a cell, and what a volunteer typed into a column rather than into a
 * document. Never restate a `maxLength`, a URL rule or an email rule in it:
 * that is the delegation above, and a second spelling is what goes stale.
 */

import type { RawImportRow } from './columns'
import type { Field, FieldAffectingData, PayloadRequest } from 'payload'

import { flattenTopLevelFields } from 'payload'
import { email, number, text } from 'payload/shared'
import { z } from 'zod'

import { Events } from '@/collections/Events/Events'

import { EVENT_TYPES, IMPORT_COLUMNS, requiredColumnsFor } from './columns'
import { isTemplateExampleRow } from './template'


export interface FieldCheckResult {
  errors: string[]
  warnings: string[]
}

type Validator = (value: unknown, options: Record<string, unknown>) => unknown

/**
 * The `t` Payload hands a validator, reduced to the keys the default text,
 * email and number validators use. A field's own validator writes its own
 * sentence; only these defaults speak through translation keys.
 */
function t(key: string, vars: Record<string, unknown> = {}): string {
  switch (key) {
    case 'validation:shorterThanMax':
      return `must be ${String(vars.maxLength)} characters or fewer`
    case 'validation:emailAddress':
      return 'must be one email address, like name@example.org'
    case 'validation:lessThanMin':
      return `must be at least ${String(vars.min)}`
    case 'validation:greaterThanMax':
      return `must be at most ${String(vars.max)}`
    case 'validation:enterNumber':
      return 'must be a number'
    default:
      return 'is not valid'
  }
}

// The validators read `req.t` and `req.payload.config` and nothing else on it.
const VALIDATION_REQ = { t, payload: { config: {}, collections: {} } } as unknown as PayloadRequest

function fieldAt(fields: Field[], path: readonly string[]): FieldAffectingData {
  const [name, ...rest] = path
  const field = flattenTopLevelFields(fields).find(
    (candidate): candidate is FieldAffectingData => 'name' in candidate && candidate.name === name,
  )
  if (!field) throw new Error(`Events has no field ${path.join('.')} for the CSV import to check`)
  if (!rest.length) return field
  return fieldAt('fields' in field ? field.fields : [], rest)
}

/** A field's own validator, or the one Payload installs when it declares none. */
function validatorFor(field: FieldAffectingData): Validator {
  if ('validate' in field && field.validate) return field.validate as Validator
  if (field.type === 'email') return email as Validator
  if (field.type === 'number') return number as Validator
  return text as Validator
}

/** The CSV column, and where the commit writes it on an event. */
const EVENT_FIELDS: Record<string, readonly string[]> = {
  title: ['title'],
  contactName: ['contactName'],
  contactPhone: ['contactPhone'],
  contactEmail: ['contactEmail'],
  website: ['website'],
  onlineUrl: ['onlineUrl'],
  venueName: ['address', 'venueName'],
  room: ['address', 'room'],
  address: ['address', 'street'],
  city: ['address', 'city'],
  postcode: ['address', 'postCode'],
  registrationLimit: ['registrationLimit'],
}

const CHECKED = Object.entries(EVENT_FIELDS).map(([column, path]) => {
  const field = fieldAt(Events.fields, path)
  return { column, field, validate: validatorFor(field) }
})

const PHONE = CHECKED.find(({ column }) => column === 'contactPhone')!

const URL_COLUMNS = new Set(['website', 'onlineUrl'])
const EMAIL_COLUMNS = new Set(['contactEmail', 'managerEmail'])

/**
 * The characters that reorder what a reader sees: the explicit embedding and
 * override controls, the isolates, and the three bare marks. A mark opens no
 * range, so nothing later in the cell closes it — which is why it is easy to
 * leave out and still believe the class is complete.
 *
 * ⚠ **Written as escapes.** The literal characters reorder this line itself in
 * an editor and in a diff, and the file then reads as the attack it refuses.
 *
 * ZWJ and ZWNJ are deliberately absent: Persian and the Indic locales need
 * them to spell words, and this check runs on every locale's cells.
 */
const BIDI_CONTROL_RE = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/

/**
 * A cell a spreadsheet would run as a formula when the published value is
 * exported and reopened. `+` and `-` count only before a function call or a
 * cell reference, so a phone number like `+49 30 123456` and a `-1` stay data.
 */
const FORMULA_RE = /^(?:[=@]|[+-]\s*(?:[A-Za-z_][\w.]*\s*\(|\$?[A-Za-z]{1,3}\$?\d+\s*(?:[-+*/^&]|$)))/

/** What Excel turns a long number into when the column is not formatted as text. */
const SCIENTIFIC_RE = /^[+-]?\d+(?:[.,]\d+)?E[+-]?\d+$/i

/** A host and optional path with no scheme, e.g. `www.example.org` or `zoom.us/j/1`. */
const BARE_HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i

/**
 * A value as an error message quotes it: shortened, with invisible characters
 * spelled out so the message itself is not reordered by them.
 */
export function echo(value: string): string {
  const visible = value.replace(
    /[\p{Cc}\p{Cf}]/gu,
    (char) => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`,
  )
  return visible.length > 60 ? `${visible.slice(0, 57)}…` : visible
}

/**
 * ⚠ **An issue's message continues its column name**, which `messagesOf`
 * prefixes from the issue path. Write each one to read after that name, so a
 * column renamed in `columns.ts` renames every message it owns.
 */
const cell = z.string().superRefine((value, ctx) => {
  if (BIDI_CONTROL_RE.test(value)) {
    ctx.addIssue({
      code: 'custom',
      message: `contains an invisible text-direction character that makes it display differently from what was typed — retype it (got "${echo(value)}")`,
    })
  }
  if (FORMULA_RE.test(value)) {
    ctx.addIssue({
      code: 'custom',
      message: `starts like a spreadsheet formula — remove the leading "${value[0]}" (got "${echo(value)}")`,
    })
  }
})

const emailCell = cell.superRefine((value, ctx) => {
  const hint = emailHint(value)
  if (hint) ctx.addIssue({ code: 'custom', message: `${hint} (got "${echo(value)}")` })
})

/**
 * `managerEmail` names a `managers` row rather than an `events` field, so it
 * has no entry in `EVENT_FIELDS` and the shape check belongs here. Payload's
 * own email validator is still what answers it.
 */
const managerEmailCell = emailCell.superRefine((value, ctx) => {
  if (emailHint(value)) return
  const verdict = (email as Validator)(value, { req: VALIDATION_REQ, required: false })
  if (typeof verdict === 'string') {
    ctx.addIssue({ code: 'custom', message: `${verdict} (got "${echo(value)}")` })
  }
})

const phoneCell = cell.superRefine((value, ctx) => {
  if (!SCIENTIFIC_RE.test(value)) return
  ctx.addIssue({
    code: 'custom',
    message: `looks like a number the spreadsheet turned into scientific notation — format the column as text and type the number again (got "${echo(value)}")`,
  })
})

const registrationLimitCell = cell.superRefine((value, ctx) => {
  const message = registrationLimitFault(value)
  if (message) ctx.addIssue({ code: 'custom', message })
})

function registrationLimitFault(value: string): string | null {
  if (!/^\d+$/.test(value)) return `must be a whole number of places, digits only (got "${echo(value)}")`
  if (Number(value) === 0) {
    return `of 0 would refuse every registration — leave it blank for unlimited (got "${value}")`
  }
  if (!Number.isSafeInteger(Number(value))) return `is too large (got "${echo(value)}")`
  return null
}

const COLUMN_CELLS: Record<string, typeof cell> = {
  contactEmail: emailCell,
  contactPhone: phoneCell,
  managerEmail: managerEmailCell,
  registrationLimit: registrationLimitCell,
}

/**
 * An issue as a volunteer reads it: its column name, then its own message.
 *
 * ⚠ **A pathless issue is the whole row's**, so it carries no column name to
 * lead with — the template's example row is the one that does this today.
 */
function messagesOf(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.map((issue) =>
    issue.path.length ? `${String(issue.path[0])} ${issue.message}` : issue.message,
  )
}

/**
 * The rules about the row rather than about one cell: which columns this
 * `eventType` owes, and whether the whole line is still the template's example.
 *
 * ⚠ **Parsed from the row with its blanks intact**, unlike `importRowSchema`.
 * Both readers need to tell a cell left empty from a column absent from the
 * header — `requiredColumnsFor` to refuse it, `isTemplateExampleRow` to compare
 * it against the example rather than skip it.
 */
const importRowShape = z.record(z.string(), z.string()).superRefine((values, ctx) => {
  const eventType = values.eventType
  if (!eventType) {
    ctx.addIssue({ code: 'custom', path: ['eventType'], message: 'is required' })
  } else if (!(EVENT_TYPES as readonly string[]).includes(eventType)) {
    ctx.addIssue({
      code: 'custom',
      path: ['eventType'],
      message: `must be ${EVENT_TYPES.join(' or ')} (got "${echo(eventType)}")`,
    })
  }

  for (const name of requiredColumnsFor(eventType)) {
    if (name === 'eventType') continue
    if (!values[name]) ctx.addIssue({ code: 'custom', path: [name], message: 'is required' })
  }

  if (isTemplateExampleRow(values)) {
    ctx.addIssue({
      code: 'custom',
      message: `this is the template's example row — delete it, or replace it with one of your classes (got title "${echo(values.title ?? '')}")`,
    })
  }
})

/**
 * Every column the template declares, so a new one is checked the moment it is
 * added rather than the day someone remembers this file.
 */
const importRowSchema = z.object(
  Object.fromEntries(
    IMPORT_COLUMNS.map(({ name }) => [name, (COLUMN_CELLS[name] ?? cell).optional()]),
  ),
)

/** A bare host published over https — the one fix unambiguous enough to make. */
const urlCell = z
  .string()
  .transform((value) =>
    /^[a-z][a-z0-9+.-]*:/i.test(value) || !BARE_HOST_RE.test(value) ? value : `https://${value}`,
  )

/**
 * Check every filled value on a row, normalising `values` in place where the
 * fix is unambiguous (a URL missing its scheme) and saying so in `warnings`.
 */
export function checkRowFields(values: RawImportRow): FieldCheckResult {
  const errors: string[] = []
  const warnings: string[] = []
  const inactive = values.scheduleType?.trim().toLowerCase() === 'inactive'

  // Normalised silently: `requiredColumnsFor` and the commit both match the
  // stored vocabulary, and a volunteer who typed `Offline` made no mistake
  // worth a warning.
  if (values.eventType) values.eventType = values.eventType.toLowerCase()

  const shape = importRowShape.safeParse(values)
  if (!shape.success) errors.push(...messagesOf(shape.error.issues))

  for (const column of URL_COLUMNS) {
    const raw = values[column]
    if (!raw) continue
    // Normalised rather than refused: every class page and meeting link this
    // column holds is served over https, and refusing would skip the row over a
    // prefix the volunteer could not have meant otherwise.
    const normalised = urlCell.parse(raw)
    if (normalised === raw) continue
    values[column] = normalised
    warnings.push(`${column} had no https:// — it will be published as "${normalised}" (got "${echo(raw)}")`)
  }

  // ⚠ **Blank cells are dropped before the parse, not made nullable.** A column
  // the volunteer left empty owes none of these checks, and `importRowShape`
  // above is what decides whether it was allowed to be empty.
  const filled = Object.fromEntries(Object.entries(values).filter(([, value]) => value))
  const parsed = importRowSchema.safeParse(filled)
  if (!parsed.success) errors.push(...messagesOf(parsed.error.issues))

  const data = { inactive, contactEmail: values.contactEmail || null }
  for (const { column, field, validate } of CHECKED) {
    const raw = values[column]
    if (!raw) continue
    if (EMAIL_COLUMNS.has(column) && emailHint(raw)) continue
    if (column === 'contactPhone' && SCIENTIFIC_RE.test(raw)) continue
    if (column === 'registrationLimit' && registrationLimitFault(raw)) continue
    const value = field.type === 'number' ? Number(raw) : raw
    const verdict = validate(value, {
      ...field,
      req: VALIDATION_REQ,
      data,
      siblingData: data,
      required: false,
    })
    if (typeof verdict === 'string') errors.push(`${column}: ${verdict} (got "${echo(raw)}")`)
  }

  // Run with a blank phone too: the rule is that a dormant class names *some*
  // contact route, and the phone field is where `Events` states it.
  if (inactive && !values.contactPhone) {
    const verdict = PHONE.validate(null, {
      ...PHONE.field,
      req: VALIDATION_REQ,
      data,
      siblingData: data,
      required: false,
    })
    if (typeof verdict === 'string') {
      errors.push(
        `contactPhone or contactEmail: ${verdict} (got scheduleType "inactive" with both blank)`,
      )
    }
  }

  return { errors, warnings }
}

/**
 * The specific mistake in an email cell, where it is one a spreadsheet makes:
 * a copied `mailto:` link, a display name, or two addresses in one cell.
 */
function emailHint(value: string): string | null {
  if (/^mailto:/i.test(value)) return 'must be the address alone, without "mailto:"'
  if (/<[^>]*@[^>]*>/.test(value)) return 'must be the address alone, without a name or <>'
  if ((value.match(/@/g)?.length ?? 0) > 1 && /[\s,;]/.test(value)) {
    return 'must hold one address — put any other in a column of its own'
  }
  return null
}
