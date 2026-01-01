'use client'

import type { FieldClientComponent } from 'payload'

import { Pill, useDocumentInfo, useField } from '@payloadcms/ui'
import { PillProps } from '@payloadcms/ui/elements/Pill'
import React, { useMemo } from 'react'

import type { PermissionLevel } from '@/lib/access'
import {
  getPermissionsForRole,
  getProjectCollections,
  getProjectIcon,
  getProjectLabel,
  getRoleProject,
} from '@/lib/access'
import type { ProjectSlug } from '@/payload-types'

/**
 * PermissionsTable Component
 *
 * Displays computed permissions in a table format for the admin UI.
 * Shows collections and their allowed operations as Pill badges.
 * For managers, also displays allowed projects in the table footer.
 *
 * This component is rendered as afterInput for the roles field.
 * Works for both managers (localized roles) and clients (non-localized roles).
 */
export const PermissionsTable: FieldClientComponent = () => {
  const { value: roles } = useField<string[]>()
  const { collectionSlug } = useDocumentInfo()

  // Determine if this is a client (API client) or manager (admin user)
  const isClient = collectionSlug === 'clients'

  // Compute permissions and projects from roles
  const { permissions, projects, implicitReadCollections } = useMemo(() => {
    if (!roles || roles.length === 0) {
      return { permissions: {}, projects: [], implicitReadCollections: [] }
    }

    // Merge permissions from all roles
    const merged: Record<string, Set<PermissionLevel>> = {}

    for (const roleSlug of roles) {
      const rolePerms = getPermissionsForRole(roleSlug)
      for (const [collection, perms] of Object.entries(rolePerms)) {
        if (!merged[collection]) merged[collection] = new Set()
        perms.forEach((p) => merged[collection].add(p as PermissionLevel))
      }
    }

    // Convert Sets back to arrays
    const permissions = Object.fromEntries(
      Object.entries(merged).map(([k, v]) => [k, Array.from(v)])
    )

    // Compute projects for managers only
    const projects = isClient
      ? []
      : [
          ...new Set(
            roles
              .map((roleSlug) => getRoleProject(roleSlug))
              .filter((project): project is ProjectSlug => project !== undefined),
          ),
        ]

    // Compute implicit read collections
    const allProjectCollections = new Set<string>()
    for (const roleSlug of roles) {
      const project = getRoleProject(roleSlug)
      if (project) {
        const collections = getProjectCollections(project)
        collections.forEach((c) => allProjectCollections.add(c))
      }
    }

    // Filter out collections that already have explicit permissions
    const implicitReadCollections = Array.from(allProjectCollections)
      .filter((collection) => !permissions[collection])
      .sort()

    return { permissions, projects, implicitReadCollections }
  }, [roles, isClient])

  if (!permissions || Object.keys(permissions).length === 0) {
    return (
      <div
        style={{
          padding: 'calc(var(--base) * 0.5)',
          color: 'var(--theme-elevation-400)',
          fontStyle: 'italic',
        }}
      >
        No permissions assigned. Assign roles to grant access.
      </div>
    )
  }

  const cellStyle = {
    padding: 'calc(var(--base) * 0.35) calc(var(--base) * 0.5)',
    color: 'var(--theme-elevation-800)',
  }

  return (
    <div style={{ padding: 'calc(var(--base) * 0.5) 0' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid var(--theme-elevation-150)',
          fontSize: '13px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: 'var(--theme-elevation-50)' }}>
            <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'left' }}>Collection</th>
            <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'left' }}>Operations</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(permissions)
            .filter(([, perms]) => Array.isArray(perms) && perms.length > 0)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([collection, perms]) => (
              <tr key={collection} style={{ borderTop: '1px solid var(--theme-elevation-150)' }}>
                <td style={{ ...cellStyle, fontWeight: 500, textTransform: 'capitalize' }}>
                  {collection.replace(/-/g, ' ')}
                </td>
                <td style={cellStyle}>
                  <div
                    style={{ display: 'flex', gap: 'calc(var(--base) * 0.25)', flexWrap: 'wrap' }}
                  >
                    {(perms as PermissionLevel[]).map((op) => (
                      <Pill key={op} pillStyle={getOperationPillStyle(op)}>
                        {op}
                      </Pill>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
        {implicitReadCollections.length > 0 && (
          <tbody>
            <tr style={{ borderTop: '2px solid var(--theme-elevation-200)' }}>
              <td style={{ ...cellStyle, fontWeight: 600, fontStyle: 'italic' }}>
                Read Access
              </td>
              <td
                style={{
                  ...cellStyle,
                  fontSize: '12px',
                  color: 'var(--theme-elevation-600)',
                  textTransform: 'capitalize',
                }}
              >
                {implicitReadCollections.map((c) => c.replace(/-/g, ' ')).join(', ')}
              </td>
            </tr>
          </tbody>
        )}
        {!isClient && projects.length > 0 && (
          <tfoot>
            <tr
              style={{
                borderTop: '2px solid var(--theme-elevation-200)',
                backgroundColor: 'var(--theme-elevation-50)',
              }}
            >
              <td style={{ ...cellStyle, fontWeight: 600 }}>Allowed Projects</td>
              <td style={cellStyle}>
                {projects.map((project) => (
                  <div
                    key={project}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'calc(var(--base) * 0.25)',
                      padding: 'calc(var(--base) * 0.1)',
                    }}
                  >
                    <img
                      src={getProjectIcon(project)}
                      alt=""
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '25%',
                      }}
                    />
                    {getProjectLabel(project)}
                  </div>
                ))}
              </td>
            </tr>
          </tfoot>
        )}
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
