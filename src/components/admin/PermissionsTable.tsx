'use client'

import type { FieldClientComponent } from 'payload'

import { Pill, useDocumentInfo, useField } from '@payloadcms/ui'
import { PillProps } from '@payloadcms/ui/elements/Pill'
import React, { useMemo } from 'react'

import type { PermissionLevel } from '@/fields/PermissionsField'
import { mergeRolePermissions } from '@/fields/PermissionsField'

/**
 * PermissionsTable Component
 *
 * Displays computed permissions in a table format for the admin UI.
 * Shows collections and their allowed operations as Pill badges.
 *
 * This component is rendered as afterInput for the roles field.
 * Works for both managers (localized roles) and clients (non-localized roles).
 */
export const PermissionsTable: FieldClientComponent = () => {
  const { value: roles } = useField<string[]>()
  const { collectionSlug } = useDocumentInfo()

  // Determine if this is a client (API client) or manager (admin user)
  const isClient = collectionSlug === 'clients'

  // Compute permissions from roles
  const permissions = useMemo(() => {
    if (!roles || roles.length === 0) {
      return {}
    }
    // Use the appropriate collection slug to determine role registry
    const collection = isClient ? 'clients' : 'managers'
    return mergeRolePermissions(roles, collection)
  }, [roles, isClient])

  if (!permissions || Object.keys(permissions).length === 0) {
    return (
      <div
        style={{
          padding: 'calc(var(--base) * 0.6)',
          color: 'var(--theme-elevation-400)',
          fontStyle: 'italic',
        }}
      >
        No permissions assigned. Assign roles to grant access.
      </div>
    )
  }

  return (
    <div style={{ padding: 'calc(var(--base) * 0.6) 0' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid var(--theme-elevation-150)',
          fontSize: '13px',
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: 'var(--theme-elevation-50)',
              borderBottom: '1px solid var(--theme-elevation-150)',
            }}
          >
            <th
              style={{
                padding: 'calc(var(--base) * 0.5) calc(var(--base) * 0.6)',
                textAlign: 'left',
                fontWeight: 600,
                color: 'var(--theme-elevation-800)',
              }}
            >
              Collection
            </th>
            <th
              style={{
                padding: 'calc(var(--base) * 0.5) calc(var(--base) * 0.6)',
                textAlign: 'left',
                fontWeight: 600,
                color: 'var(--theme-elevation-800)',
              }}
            >
              Operations
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(permissions)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([collection, perms]) => (
              <tr key={collection} style={{ borderBottom: '1px solid var(--theme-elevation-150)' }}>
                <td
                  style={{
                    padding: 'calc(var(--base) * 0.5) calc(var(--base) * 0.6)',
                    color: 'var(--theme-elevation-800)',
                    fontWeight: 500,
                    textTransform: 'capitalize',
                  }}
                >
                  {collection.replace(/-/g, ' ')}
                </td>
                <td style={{ padding: 'calc(var(--base) * 0.5) calc(var(--base) * 0.6)' }}>
                  <div
                    style={{ display: 'flex', gap: 'calc(var(--base) * 0.3)', flexWrap: 'wrap' }}
                  >
                    {perms.map((op) => (
                      <Pill key={op} pillStyle={getOperationPillStyle(op)}>
                        {op}
                      </Pill>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Map permission operation to Pill style
 */
function getOperationPillStyle(operation: PermissionLevel): PillProps['pillStyle'] {
  const styleMap: Record<PermissionLevel, PillProps['pillStyle']> = {
    read: undefined, // Grey
    create: 'success', // Blue
    update: 'warning', // Orange
    delete: 'error', // Red
    translate: 'warning', // Orange
  }

  return styleMap[operation] || undefined
}

export default PermissionsTable
