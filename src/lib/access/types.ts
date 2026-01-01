/**
 * Type definitions for the Access Plugin
 *
 * This module defines core types for the accessPlugin including permission checking,
 * bypass functions, and user types.
 */

import type { CollectionSlug, Operation, TypedUser } from 'payload'

import type { LocaleCode } from '@/lib/locales'

// ============================================================================
// Permission Level Type
// ============================================================================

/**
 * Permission operations supported by the access system
 * - Standard CRUD operations from Payload
 * - 'translate' for localized field updates only
 */
export type PermissionLevel = Operation | 'translate'

// ============================================================================
// Bypass Permission Function
// ============================================================================

/**
 * Unified bypass permission function type.
 * Combines result type, context, and function signature into a single cohesive type.
 *
 * @param user - The authenticated user (manager or client)
 * @param context - Permission check context (collection, operation, optional docId)
 * @returns 'allow' to grant access, 'deny' to block, 'continue' to proceed with normal checks
 */
export type BypassPermissionFunction = (
  user: TypedAuthUser,
  context: {
    collection: CollectionSlug
    operation: string
    docId?: string | number
  },
) => 'allow' | 'deny' | 'continue'

// ============================================================================
// User Types
// ============================================================================

/**
 * Generic authenticated user type for access checking
 * Works with any auth collection (managers, clients, or custom)
 *
 * Role structure is auto-detected:
 * - Array of strings = flat roles (e.g., clients)
 * - Object with locale keys = localized roles (e.g., managers)
 */
export type TypedAuthUser = TypedUser & {
  /** Auth collection this user belongs to */
  collection: string
  /** User's roles - can be flat array or localized object */
  roles?: string[] | Record<string, string[]>
  /** Custom resource access for document-level permissions */
  customResourceAccess?: Array<{ relationTo: string; value: string | number }>
  /** Currently selected project (for managers) */
  currentProject?: string | null
  /** Whether the user is active (for clients) */
  active?: boolean
  /** User type (for managers: 'admin' | 'manager' | 'inactive') */
  type?: string
}

// ============================================================================
// Permission Check Arguments
// ============================================================================

/**
 * Arguments for permission checking
 */
export interface PermissionCheckArgs {
  /** The authenticated user */
  user: TypedUser | null
  /** Collection or global slug being accessed */
  collection: CollectionSlug
  /** Operation to check */
  operation: Operation
  /** Current locale for manager role extraction */
  locale?: LocaleCode
  /** Document ID for document-level permissions */
  docId?: string | number
  /** Field metadata for field-level permissions (e.g., { localized: true }) */
  field?: { localized?: boolean }
}