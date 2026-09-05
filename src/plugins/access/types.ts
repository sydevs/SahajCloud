/**
 * Type definitions for the Access Plugin
 *
 * This module defines core types for the accessPlugin including permission checking,
 * bypass functions, and user types.
 */

import type { CollectionSlug, FieldAccess, GlobalSlug, Operation, TypedUser } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import type { Client, Manager, RoleSlug } from '@/payload-types'

// ============================================================================
// Permission Level Type
// ============================================================================

/**
 * Permission operations supported by the access system
 * - Standard CRUD operations from Payload
 * - 'translate' for localized field updates only
 */
export type PermissionLevel = Operation | 'translate'

/**
 * Union type for any Payload collection or global slug
 * Used throughout access control for unified permission checking
 */
export type ContentSlug = CollectionSlug | GlobalSlug

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
    collection: ContentSlug
    operation: PermissionLevel
    docId?: string | number
  },
) => 'allow' | 'deny' | 'continue'

// ============================================================================
// User Types
// ============================================================================

/**
 * Generic authenticated user type for access checking.
 * Works with any auth collection (managers, clients, or custom).
 */
export type TypedAuthUser = TypedUser &
  Partial<Pick<Manager, 'currentProject' | 'type'>> &
  Partial<Pick<Client, '_status'>> & {
    /** Auth collection this user belongs to */
    collection: 'managers' | 'clients'
    /**
     * User's roles — a flat array for clients, a per-locale record for managers.
     *
     * This member is the one that cannot be a `Pick`. `hydrateLocalizedRoles`
     * produces the per-locale record during authentication, and no generated
     * type can express it — the collection declares `roles` as `localized`, so
     * Payload generates the single-locale array (#665). A manager read any
     * other way carries that flat, default-locale array instead.
     */
    roles?: RoleSlug[] | Record<LocaleCode, RoleSlug[]>
  }

// ============================================================================
// Permission Check Arguments
// ============================================================================

/**
 * Which of a manager's per-locale role sets a permission check evaluates.
 *
 * A manager's roles are localized, so "which locale" is part of the question and
 * every caller has to answer it. The three answers are deliberately distinct, and
 * `undefined` is one of them rather than a default:
 *
 * - a `LocaleCode` — the roles assigned in that locale. The normal case.
 * - `'union'` — roles in ANY locale. For checks that genuinely have no locale to
 *   offer, which today is admin-UI nav visibility alone (`createHidden`).
 * - `undefined` — no locale is resolvable, so a manager gets nothing. Clients are
 *   unaffected; their roles are a flat array.
 *
 * Before #665 an absent locale silently resolved to the DEFAULT locale's roles,
 * which granted every manager's English roles in all 19 locales. Making the
 * scope explicit is what stops that returning by accident.
 */
export type RoleScope = LocaleCode | 'union'

/**
 * Arguments for permission checking
 */
export interface PermissionCheckArgs {
  /** The authenticated user */
  user: TypedUser | null
  /** Collection or global slug being accessed */
  collection: ContentSlug
  /** Operation to check */
  operation: Operation
  /** Which locale's manager roles to evaluate — see {@link RoleScope} */
  locale?: RoleScope
  /** Document ID for document-level permissions */
  docId?: string | number
  /** Field metadata for field-level permissions (e.g., { localized: true }) */
  field?: { localized?: boolean }
}

// ============================================================================
// Field Access Config Type
// ============================================================================

/**
 * Field access configuration type for field-level access control
 * Used for non-localized fields in translatable collections
 */
export type FieldAccessConfig = {
  read?: FieldAccess
  create?: FieldAccess
  update?: FieldAccess
}
