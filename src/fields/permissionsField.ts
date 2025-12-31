/**
 * Permissions Field Factories
 *
 * Field factories for Managers and Clients collections.
 * Role options are imported from the generated access data.
 *
 * @see scripts/generate-access.ts for the generation script
 * @see src/generated/access.ts for the generated data
 */

import type { Field } from 'payload'

import { CLIENT_ROLE_OPTIONS, MANAGER_ROLE_OPTIONS } from '@/generated/access'

// ============================================================================
// Field Factories
// ============================================================================

/**
 * Create permissions-related fields for Managers collection
 *
 * Returns an array of 3 fields:
 * 1. type - Manager access level (inactive, manager, admin) with toggle button group
 * 2. roles - Localized multi-select of manager roles (hidden if type is not 'manager')
 * 3. customResourceAccess - Polymorphic relationship for document-level permissions (hidden if type is not 'manager')
 *
 * Note: The virtual permissions field has been removed. The accessPlugin now computes
 * permissions directly from the roles field using pre-computed lookup tables.
 *
 * @returns Array of Payload field configurations
 */
export function managerPermissionsFields(): Field[] {
  return [
    // 1. Type field (segmented control for access level)
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'manager',
      options: [
        { label: 'Inactive', value: 'inactive' },
        { label: 'Manager', value: 'manager' },
        { label: 'Admin', value: 'admin' },
      ],
      admin: {
        description:
          "Set the manager's access level. Admin grants full access, Manager uses role-based permissions, Inactive blocks all access.",
        components: {
          Field: '@/components/admin/ToggleGroupField',
        },
      },
      access: {
        // Only admins can update the type field
        update: ({ req: { user } }) => {
          return user?.collection === 'managers' && user.type === 'admin'
        },
      },
    },

    // 2. Roles field (localized multi-select)
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      localized: true,
      // Not required - managers can have only customResourceAccess without roles
      options: [...MANAGER_ROLE_OPTIONS],
      admin: {
        description:
          'Assign roles for each locale. Different roles can be assigned for different languages.',
        condition: (data) => data.type === 'manager',
        components: {
          afterInput: ['@/components/admin/PermissionsTable'],
        },
      },
      access: {
        // Only admins can update roles
        update: ({ req: { user } }) => {
          return user?.collection === 'managers' && user.type === 'admin'
        },
      },
    },

    // 3. Custom Resource Access
    {
      name: 'customResourceAccess',
      type: 'relationship',
      relationTo: ['pages'],
      hasMany: true,
      admin: {
        description:
          'Grant update access to specific documents. Useful for giving access to individual pages without broader permissions.',
        condition: (data) => data.type === 'manager',
      },
      access: {
        // Only admins can update custom resource access
        update: ({ req: { user } }) => {
          return user?.collection === 'managers' && user.type === 'admin'
        },
      },
    },
  ]
}

/**
 * Create permissions-related fields for Clients collection
 *
 * Returns an array of 1 field:
 * 1. roles - Non-localized multi-select of client roles
 *
 * Note: The virtual permissions field has been removed. The accessPlugin now computes
 * permissions directly from the roles field using pre-computed lookup tables.
 *
 * @returns Array of Payload field configurations
 */
export function clientPermissionsFields(): Field[] {
  return [
    // Roles field (non-localized multi-select)
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: [...CLIENT_ROLE_OPTIONS],
      admin: {
        description: 'Assign API client roles. Roles apply to all locales.',
        components: {
          afterInput: ['@/components/admin/PermissionsTable'],
        },
      },
    },
  ]
}
