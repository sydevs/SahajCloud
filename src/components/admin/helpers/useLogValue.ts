'use client'

import { useAllFormFields } from '@payloadcms/ui'
import { reduceFieldsToValues } from 'payload/shared'

/**
 * The stored rows of a `logField`, from form state.
 *
 * A `useField` read answers the **row count** for an array field, not its
 * rows, and the log's readers want the entries. `reduceFieldsToValues` is
 * Payload's own way back to a document shape — it is what the live-preview
 * provider posts into the iframe.
 */
export function useLogValue(path: string): unknown {
  const [fields] = useAllFormFields()
  const data = reduceFieldsToValues(fields, true) as Record<string, unknown>
  return path.split('.').reduce<unknown>((value, segment) => {
    if (typeof value !== 'object' || value === null) return undefined
    return (value as Record<string, unknown>)[segment]
  }, data)
}
