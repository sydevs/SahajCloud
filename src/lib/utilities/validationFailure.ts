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
 * Manager-facing descriptions of what is wrong, one per failing field —
 * "Contact Phone Number: This field is required."
 *
 * `path` is an internal field name, so a label we cannot read falls back to the
 * validator's own message rather than to the path. A label function is one such:
 * resolving it needs an i18n context, and this caller has no `req` to take one from.
 */
export function describeValidationErrors(errors: ValidationFieldError[]): string[] {
  return errors.map((error) => {
    const name = typeof error.label === 'string' ? error.label : null
    return name ? `${name}: ${error.message}` : error.message
  })
}
