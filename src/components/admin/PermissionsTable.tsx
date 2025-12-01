'use client'

import type { FieldClientComponent } from 'payload'

import React from 'react'

import type { MergedPermissions } from '@/fields/PermissionsField'

/**
 * PermissionsTable Component
 *
 * Displays computed permissions in a table format for the admin UI.
 * Shows collections and their allowed operations as badges.
 */
export const PermissionsTable: FieldClientComponent = ({ field, value }) => {
  const permissions = value as MergedPermissions | undefined

  if (!permissions || Object.keys(permissions).length === 0) {
    return (
      <div style={{ padding: '12px', color: '#9A9A9A', fontStyle: 'italic' }}>
        No permissions assigned. Assign roles to grant access.
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 0' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #E5E5E5',
          fontSize: '13px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#F5F5F5', borderBottom: '1px solid #E5E5E5' }}>
            <th
              style={{
                padding: '10px 12px',
                textAlign: 'left',
                fontWeight: 600,
                color: '#333',
              }}
            >
              Collection
            </th>
            <th
              style={{
                padding: '10px 12px',
                textAlign: 'left',
                fontWeight: 600,
                color: '#333',
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
              <tr key={collection} style={{ borderBottom: '1px solid #E5E5E5' }}>
                <td
                  style={{
                    padding: '10px 12px',
                    color: '#333',
                    fontWeight: 500,
                    textTransform: 'capitalize',
                  }}
                >
                  {collection.replace(/-/g, ' ')}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {perms.operations.map((op) => (
                      <span
                        key={op}
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 500,
                          textTransform: 'capitalize',
                          ...getOperationStyle(op),
                        }}
                      >
                        {op}
                      </span>
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
 * Get styling for operation badges based on operation type
 */
function getOperationStyle(operation: string): React.CSSProperties {
  const styles: Record<string, React.CSSProperties> = {
    read: {
      backgroundColor: '#E3F2FD',
      color: '#1976D2',
    },
    create: {
      backgroundColor: '#E8F5E9',
      color: '#388E3C',
    },
    update: {
      backgroundColor: '#FFF3E0',
      color: '#F57C00',
    },
    delete: {
      backgroundColor: '#FFEBEE',
      color: '#D32F2F',
    },
    translate: {
      backgroundColor: '#F3E5F5',
      color: '#7B1FA2',
    },
  }

  return styles[operation] || { backgroundColor: '#F5F5F5', color: '#666' }
}
