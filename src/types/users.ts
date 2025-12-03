/**
 * User type definitions for managers and clients
 */

import type { TypedUser } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import { Manager } from '@/payload-types'
import type { MergedPermissions } from '@/types/permissions'
import type { ClientRole, ManagerRole } from '@/types/roles'

// ============================================================================
// Manager User Type
// ============================================================================

export type TypedManager = TypedUser & {
  collection: 'managers'
  type?: Manager['type']
  roles?: ManagerRole[] | Record<LocaleCode, ManagerRole[]>
  customResourceAccess?: Array<{ relationTo: string; value: string | number }>
  permissions?: MergedPermissions
}

// ============================================================================
// Client User Type
// ============================================================================

export type TypedClient = TypedUser & {
  collection: 'clients'
  roles?: ClientRole[]
  permissions?: MergedPermissions
}
