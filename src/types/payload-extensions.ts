/**
 * Type extensions for Payload CMS
 *
 * This file provides proper TypeScript types for Payload functionality
 * that isn't fully typed in the official package or needs extension.
 */

import type { PayloadRequest, CollectionSlug, Operation } from 'payload'

/**
 * Field validation context passed to validate functions
 *
 * @template TData - The document data type being validated
 */
export interface FieldValidationContext<TData = Record<string, unknown>> {
  /** Current field value being validated */
  value: unknown
  /** Complete document data being validated */
  data: TData
  /** Document ID (undefined for create operations) */
  id?: string
  /** Operation being performed (create, update) */
  operation: Operation
  /** Sibling field data (for fields in arrays/groups) */
  siblingData?: Record<string, unknown>
  /** Full Payload request object */
  req: PayloadRequest
  /** Original document data (available for updates) */
  originalDoc?: TData
}

/**
 * Type-safe field validator function
 * Returns true if valid, or an error message string if invalid
 *
 * @template TData - The document data type
 *
 * @example
 * const validateTitle: FieldValidator<Page> = (value, { data, operation }) => {
 *   if (operation === 'update' && !value) {
 *     return 'Title is required for updates'
 *   }
 *   return true
 * }
 */
export type FieldValidator<TData = Record<string, unknown>> = (
  value: unknown,
  context: FieldValidationContext<TData>,
) => true | string | Promise<true | string>

/**
 * Polymorphic relationship value
 * Can be a string ID, a relationship object, or the full document
 *
 * @template T - The related document type
 */
export type PolymorphicRelation<T = unknown> =
  | string
  | {
      relationTo: CollectionSlug
      value: string
    }
  | T

/**
 * Helper type for extracting document data from Payload types
 * Useful for working with collection-specific validation
 */
export type DocumentData<T> = T extends { id: string | number } ? T : never

/**
 * Type guard to check if a value is a PolymorphicRelation object
 */
export function isPolymorphicRelation(
  value: unknown,
): value is { relationTo: CollectionSlug; value: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'relationTo' in value &&
    'value' in value &&
    typeof (value as { relationTo: unknown }).relationTo === 'string' &&
    typeof (value as { value: unknown }).value === 'string'
  )
}

/**
 * Extract the ID from a polymorphic relation value
 * Handles string IDs, relation objects, and full documents
 *
 * @param value - The polymorphic relation value
 * @returns The ID string or undefined
 *
 * @example
 * const id1 = extractRelationId('abc123') // 'abc123'
 * const id2 = extractRelationId({ relationTo: 'pages', value: 'def456' }) // 'def456'
 * const id3 = extractRelationId({ id: 'ghi789', title: 'Test' }) // 'ghi789'
 */
export function extractRelationId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  if (isPolymorphicRelation(value)) {
    return value.value
  }

  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id: unknown }).id
    return typeof id === 'string' ? id : String(id)
  }

  return undefined
}
