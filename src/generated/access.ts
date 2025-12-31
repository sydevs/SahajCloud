/**
 * Generated Access Data
 *
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Run: pnpm generate:access
 *
 * This file provides lookup tables for both server and client contexts,
 * generated from accessPluginConfig in payload.config.ts.
 */

import type { PermissionLevel } from '@/lib/access/types'

// ============================================================================
// Role Options (for select fields)
// ============================================================================

/**
 * Manager role options for select fields
 */
export const MANAGER_ROLE_OPTIONS = [
  {
    "value": "meditations-editor",
    "label": "Meditations Editor"
  },
  {
    "value": "path-editor",
    "label": "Path Editor"
  },
  {
    "value": "translator",
    "label": "Translator"
  }
] as const

/**
 * Client role options for select fields
 */
export const CLIENT_ROLE_OPTIONS = [
  {
    "value": "wemeditate-web",
    "label": "We Meditate Web"
  },
  {
    "value": "wemeditate-app",
    "label": "We Meditate App"
  },
  {
    "value": "sahaj-atlas",
    "label": "Sahaj Atlas"
  }
] as const

// ============================================================================
// Permission Lookup Data
// ============================================================================

/**
 * Manager permissions by role and collection
 * Structure: { [roleSlug]: { [collectionSlug]: PermissionLevel[] } }
 */
export const MANAGER_PERMISSIONS: Record<string, Record<string, PermissionLevel[]>> = {
  "meditations-editor": {
    "meditations": [
      "create",
      "update"
    ],
    "images": [
      "create"
    ],
    "files": [
      "create"
    ]
  },
  "path-editor": {
    "lessons": [
      "update"
    ],
    "lectures": [
      "update"
    ],
    "images": [
      "create"
    ],
    "files": [
      "create"
    ]
  },
  "translator": {
    "pages": [
      "translate"
    ],
    "music": [
      "translate"
    ]
  }
}

/**
 * Client permissions by role and collection
 * Structure: { [roleSlug]: { [collectionSlug]: PermissionLevel[] } }
 */
export const CLIENT_PERMISSIONS: Record<string, Record<string, PermissionLevel[]>> = {
  "wemeditate-web": {
    "we-meditate-web-settings": [
      "read"
    ],
    "meditations": [
      "read"
    ],
    "frames": [
      "read"
    ],
    "narrators": [
      "read"
    ],
    "images": [
      "read"
    ],
    "files": [
      "read"
    ],
    "pages": [
      "read"
    ],
    "music": [
      "read"
    ],
    "albums": [
      "read"
    ],
    "forms": [
      "read"
    ],
    "authors": [
      "read"
    ],
    "meditation-tags": [
      "read"
    ],
    "page-tags": [
      "read"
    ],
    "music-tags": [
      "read"
    ],
    "form-submissions": [
      "create"
    ]
  },
  "wemeditate-app": {
    "we-meditate-app-settings": [
      "read"
    ],
    "meditations": [
      "read"
    ],
    "frames": [
      "read"
    ],
    "narrators": [
      "read"
    ],
    "lessons": [
      "read"
    ],
    "lectures": [
      "read"
    ],
    "music": [
      "read"
    ],
    "albums": [
      "read"
    ],
    "images": [
      "read"
    ],
    "files": [
      "read"
    ],
    "meditation-tags": [
      "read"
    ],
    "page-tags": [
      "read"
    ],
    "music-tags": [
      "read"
    ]
  },
  "sahaj-atlas": {
    "sahaj-atlas-settings": [
      "read"
    ],
    "images": [
      "read"
    ],
    "files": [
      "read"
    ]
  }
}

// ============================================================================
// Project Lookup Data
// ============================================================================

/**
 * Collections and globals available in each project
 * Used for project-based implicit read access
 */
export const PROJECT_COLLECTIONS: Record<string, string[]> = {
  "wemeditate-web": [
    "pages",
    "meditations",
    "music",
    "albums",
    "forms",
    "authors",
    "page-tags",
    "meditation-tags",
    "music-tags",
    "narrators",
    "frames",
    "we-meditate-web-settings"
  ],
  "wemeditate-app": [
    "meditations",
    "music",
    "albums",
    "lessons",
    "lectures",
    "frames",
    "narrators",
    "meditation-tags",
    "music-tags",
    "we-meditate-app-settings"
  ],
  "sahaj-atlas": [
    "sahaj-atlas-settings"
  ]
}

/**
 * Manager role to project mapping
 * Each role is associated with a project for implicit read access
 */
export const MANAGER_ROLE_PROJECTS: Record<string, string> = {
  "meditations-editor": "wemeditate-app",
  "path-editor": "wemeditate-app",
  "translator": "wemeditate-web"
}

/**
 * Client role to project mapping
 * Each client role is associated with a project for implicit read access
 */
export const CLIENT_ROLE_PROJECTS: Record<string, string> = {
  "wemeditate-web": "wemeditate-web",
  "wemeditate-app": "wemeditate-app",
  "sahaj-atlas": "sahaj-atlas"
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get permissions for a set of roles
 *
 * Merges permissions from multiple roles into a single object.
 * Used by PermissionsTable component for real-time display.
 *
 * @param roles - Array of role slugs
 * @param type - 'managers' or 'clients'
 * @returns Merged permissions object
 */
export function getPermissionsForRoles(
  roles: string[],
  type: 'managers' | 'clients',
): Record<string, PermissionLevel[]> {
  const lookup = type === 'managers' ? MANAGER_PERMISSIONS : CLIENT_PERMISSIONS
  const merged: Record<string, Set<PermissionLevel>> = {}

  for (const role of roles) {
    const perms = lookup[role]
    if (perms) {
      for (const [collection, ops] of Object.entries(perms)) {
        if (!merged[collection]) {
          merged[collection] = new Set()
        }
        ops.forEach((op) => merged[collection].add(op))
      }
    }
  }

  return Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [k, Array.from(v)]),
  )
}

/**
 * Get the project associated with a role
 *
 * @param role - Role slug
 * @param type - 'managers' or 'clients'
 * @returns Project slug or undefined
 */
export function getRoleProject(role: string, type: 'managers' | 'clients'): string | undefined {
  const lookup = type === 'managers' ? MANAGER_ROLE_PROJECTS : CLIENT_ROLE_PROJECTS
  return lookup[role]
}

/**
 * Get collections available in a project
 *
 * @param project - Project slug
 * @returns Array of collection/global slugs
 */
export function getProjectCollections(project: string): string[] {
  return PROJECT_COLLECTIONS[project] || []
}
