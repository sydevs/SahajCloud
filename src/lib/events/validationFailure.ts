import type { ValidationFieldError } from 'payload'

import { ValidationError } from 'payload'

/**
 * The field errors behind a failed write, or `null` when the failure was not a
 * validation failure. The two verify surfaces answer those two cases
 * differently: invalid stored data is the manager's to fix, anything else is
 * ours (#842).
 */
export function validationFieldErrors(error: unknown): ValidationFieldError[] | null {
  return error instanceof ValidationError ? error.data.errors : null
}

/**
 * Name a failing field the way its manager sees it. `path` is an internal field
 * name, so it is the last resort rather than the default. A label function
 * needs an i18n context we do not have here, and resolving it would mean
 * threading a `req` into a page that has none.
 */
function fieldName(error: ValidationFieldError): string | null {
  const { label } = error
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const first = Object.values(label).find((value) => typeof value === 'string')
    if (first) return first
  }
  return null
}

/**
 * Manager-facing descriptions of what is wrong, one per failing field —
 * "Contact Phone Number: This field is required."
 */
export function describeValidationErrors(errors: ValidationFieldError[]): string[] {
  return errors.map((error) => {
    const name = fieldName(error)
    return name ? `${name}: ${error.message}` : error.message
  })
}
