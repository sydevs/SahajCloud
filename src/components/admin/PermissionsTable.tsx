'use client'

import type { FieldClientComponent } from 'payload'

import { Pill, useDocumentInfo, useField } from '@payloadcms/ui'
import { PillProps } from '@payloadcms/ui/elements/Pill'
import React, { useMemo } from 'react'

import type { RoleSlug } from '@/payload-types'
import {
  getPermissionsForRole,
  getProjectIcon,
  getProjectLabel,
  getReadableCollections,
  getRoleProject,
  isRestrictedCollection,
} from '@/plugins/access/config'
import type { PermissionLevel } from '@/plugins/access/types'

/**
 * PermissionsTable Component
 *
 * Displays computed permissions in a table format for the admin UI.
 * Shows collections and their allowed operations as Pill badges.
 * For managers, also displays allowed projects in the table footer.
 *
 * This component is rendered as afterInput for the roles field.
 * Works for both managers (localized roles) and clients (non-localized roles).
 *
 * **A client's reads are rows of their own; a manager's stay in the footer.** A
 * manager reads nearly everything, so listing it would bury the writes. A
 * service key reads a handful of collections, and which ones is the thing an
 * operator is deciding — so its implicit reads (`hasPermission` step 4a, the
 * role's project minus `RESTRICTED_COLLECTIONS`) and the self-read every key has
 * of its own `clients` row are shown beside its writes.
 */
export const PermissionsTable: FieldClientComponent = () => {
  const { value: roles } = useField<RoleSlug[]>()
  const { collectionSlug } = useDocumentInfo()

  // Determine if this is a client (API client) or manager (admin user)
  const isClient = collectionSlug === 'clients'

  // Compute permissions and projects from roles
  const { permissions, projects, readableCollections } = useMemo(() => {
    if (!roles || roles.length === 0) {
      return { permissions: {}, projects: [], readableCollections: [] }
    }

    // Merge permissions from all roles
    // Keyed by string: a client's reads include globals, which are no collection.
    const merged: Record<string, Set<PermissionLevel>> = {}

    for (const roleSlug of roles) {
      const rolePerms = getPermissionsForRole(roleSlug)
      for (const [collection, perms] of Object.entries(rolePerms)) {
        if (!merged[collection]) merged[collection] = new Set()
        perms.forEach((p) => merged[collection].add(p as PermissionLevel))
      }
    }

    // Compute readable collections using helper
    // Filter out collections that already have explicit permissions
    const readableCollections = getReadableCollections(roles)

    if (isClient) {
      for (const collection of readableCollections) {
        if (isRestrictedCollection(collection)) continue
        if (!merged[collection]) merged[collection] = new Set()
        merged[collection].add('read')
      }
    }

    // Convert Sets back to arrays, reads first
    const permissions = Object.fromEntries(
      Object.entries(merged).map(([k, v]) => [
        k,
        Array.from(v).sort((a, b) => OPERATION_ORDER.indexOf(a) - OPERATION_ORDER.indexOf(b)),
      ]),
    )

    // Compute projects for managers only
    const projects = isClient
      ? []
      : [
          ...new Set(
            roles
              .map((roleSlug) => getRoleProject(roleSlug))
              .filter((project) => project !== undefined),
          ),
        ]

    return { permissions, projects, readableCollections }
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
        {isClient
          ? 'No access yet. Choose what this service’s key may reach.'
          : 'No permissions assigned. Assign roles to grant access.'}
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
          {isClient ? (
            <tr style={{ borderTop: '1px solid var(--theme-elevation-150)' }}>
              <td style={{ ...cellStyle, fontWeight: 500 }}>Its own service record</td>
              <td style={cellStyle}>
                <Pill pillStyle={getOperationPillStyle('read')}>read</Pill>
              </td>
            </tr>
          ) : null}
        </tbody>
        {!isClient && projects.length > 0 && (
          <tfoot>
            <tr
              style={{
                borderTop: '2px solid var(--theme-elevation-200)',
                backgroundColor: 'var(--theme-elevation-50)',
              }}
            >
              <td style={{ ...cellStyle, fontWeight: 600 }}>Project Access</td>
              <td style={cellStyle}>
                {/* Projects on a single line */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'calc(var(--base) * 0.5)',
                    alignItems: 'center',
                  }}
                >
                  {projects.map((project) => (
                    <React.Fragment key={project}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'calc(var(--base) * 0.25)',
                        }}
                      >
                        <img
                          src={getProjectIcon(project)}
                          alt=""
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '25%',
                          }}
                        />
                        <span>{getProjectLabel(project)}</span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>

                {/* Readable collections section */}
                {readableCollections.length > 0 && (
                  <div style={{ marginTop: 'calc(var(--base) * 0.5)' }}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--theme-elevation-500)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '4px',
                      }}
                    >
                      Allows read access for:
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--theme-elevation-600)',
                        textTransform: 'capitalize',
                        lineHeight: 1.4,
                      }}
                    >
                      {readableCollections.map((c) => c.replace(/-/g, ' ')).join(', ')}
                    </div>
                  </div>
                )}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

const OPERATION_ORDER: PermissionLevel[] = ['read', 'create', 'update', 'delete', 'translate']

/** Map permission operation to Pill style */
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
