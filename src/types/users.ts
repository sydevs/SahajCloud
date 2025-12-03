/**
 * User type definitions for managers and clients
 */

import type { TypedUser } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import type { MergedPermissions } from '@/types/permissions'

// ============================================================================
// Manager User Type
// ============================================================================

export type TypedManager = TypedUser & {
  collection: 'managers'
  type?: 'inactive' | 'manager' | 'admin'
  roles?: string[] | Record<LocaleCode, string[]>
  customResourceAccess?: Array<{ relationTo: string; value: string | number }>
  permissions?: MergedPermissions
}

// ============================================================================
// Client User Type
// ============================================================================

export type TypedClient = TypedUser & {
  collection: 'clients'
  roles?: string[]
  permissions?: MergedPermissions
}
