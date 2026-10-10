/**
 * Per-value checks on a parsed row — the ones the `events` write would
 * otherwise make at commit, after the batch is locked and the volunteer can no
 * longer fix the file.
 *
 * ⚠ **The Events field validators are called, not restated.** Each column is
 * looked up in the `Events` config and its own `validate` (or the default
 * Payload installs for its type) is run against the value, so a changed
 * `maxLength` or a tightened URL rule is enforced here the day it lands. A
 * field that disappears throws at import, which fails every spec that loads
 * the parser rather than letting this check go quietly inert.
 */

import type { RawImportRow } from './columns'
import type { Field, FieldAffectingData, PayloadRequest } from 'payload'

import { flattenTopLevelFields } from 'payload'
import { email, number, text } from 'payload/shared'

import { Events } from '@/collections/Events/Events'


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

/** Explicit embedding and override controls: they reorder what a reader sees. */
const BIDI_CONTROL_RE = /[\u202A-\u202E\u2066-\u2069]/

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
 * Check every filled value on a row, normalising `values` in place where the
 * fix is unambiguous (a URL missing its scheme) and saying so in `warnings`.
 */
export function checkRowFields(values: RawImportRow): FieldCheckResult {
  const errors: string[] = []
  const warnings: string[] = []
  const inactive = values.scheduleType?.trim().toLowerCase() === 'inactive'

  for (const [column, raw] of Object.entries(values)) {
    if (!raw) continue
    if (BIDI_CONTROL_RE.test(raw)) {
      errors.push(
        `${column} contains an invisible text-direction character that makes it display differently from what was typed — retype it (got "${echo(raw)}")`,
      )
    }
    if (FORMULA_RE.test(raw)) {
      errors.push(
        `${column} starts like a spreadsheet formula — remove the leading "${raw[0]}" (got "${echo(raw)}")`,
      )
    }
  }

  for (const column of URL_COLUMNS) {
    const raw = values[column]
    if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || !BARE_HOST_RE.test(raw)) continue
    // Normalised rather than refused: every class page and meeting link this
    // column holds is served over https, and refusing would skip the row over a
    // prefix the volunteer could not have meant otherwise.
    values[column] = `https://${raw}`
    warnings.push(
      `${column} had no https:// — it will be published as "${values[column]}" (got "${echo(raw)}")`,
    )
  }

  for (const column of EMAIL_COLUMNS) {
    const raw = values[column]
    if (!raw) continue
    const hint = emailHint(raw)
    if (hint) {
      errors.push(`${column} ${hint} (got "${echo(raw)}")`)
      continue
    }
    if (column === 'managerEmail') {
      const verdict = (email as Validator)(raw, { req: VALIDATION_REQ, required: false })
      if (typeof verdict === 'string') errors.push(`${column} ${verdict} (got "${echo(raw)}")`)
    }
  }

  const phone = values.contactPhone
  if (phone && SCIENTIFIC_RE.test(phone)) {
    errors.push(
      `contactPhone looks like a number the spreadsheet turned into scientific notation — format the column as text and type the number again (got "${echo(phone)}")`,
    )
  }

  const limit = values.registrationLimit
  if (limit && !/^\d+$/.test(limit)) {
    errors.push(
      `registrationLimit must be a whole number of places, digits only (got "${echo(limit)}")`,
    )
  } else if (limit && Number(limit) === 0) {
    errors.push(
      `registrationLimit of 0 would refuse every registration — leave it blank for unlimited (got "${limit}")`,
    )
  } else if (limit && !Number.isSafeInteger(Number(limit))) {
    errors.push(`registrationLimit is too large (got "${echo(limit)}")`)
  }

  const data = { inactive, contactEmail: values.contactEmail || null }
  for (const { column, field, validate } of CHECKED) {
    const raw = values[column]
    if (!raw) continue
    if (EMAIL_COLUMNS.has(column) && emailHint(raw)) continue
    if (column === 'contactPhone' && SCIENTIFIC_RE.test(raw)) continue
    if (column === 'registrationLimit' && !/^\d+$/.test(raw)) continue
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
