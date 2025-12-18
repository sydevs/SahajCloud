/**
 * OpenAPI Spec Marker Utility
 *
 * Adds `x-internal: true` markers to OpenAPI operations that should be hidden
 * from the Scalar documentation UI. Scalar respects this extension and hides
 * marked operations from the public documentation.
 *
 * Uses a two-tier filtering approach:
 * 1. ALWAYS_HIDDEN_COLLECTIONS - System collections always hidden from public docs
 * 2. Role-based filtering - Content collections filtered by CLIENT_ROLES permissions
 */

import type { ClientRole } from '@/types/roles'

import { getAllClientCollections, getCollectionsForRole } from './filterByClientRole'

/**
 * Collections that are ALWAYS hidden from public API docs regardless of role.
 * These are system/internal collections that should never be exposed.
 */
export const ALWAYS_HIDDEN_COLLECTIONS = [
  // Access collections - internal user management
  'managers',
  'clients',

  // System collections - internal file storage
  'images',
  'files',
  'image-tags',

  // Payload internal collections
  'payload-kv',
  'payload-jobs',
  'payload-locked-documents',
  'payload-preferences',
  'payload-migrations',
  'payload-job-stats',
]

/**
 * HTTP operations excluded from public docs.
 * API clients only have read access (plus form-submissions POST).
 */
export const EXCLUDED_OPERATIONS = ['delete', 'patch'] as const

/**
 * Collections allowed to have POST operations visible.
 * These are collections where API clients can create new documents.
 */
export const ALLOW_POST_FOR = ['form-submissions']

export interface MarkerOptions {
  /** Client role to filter collections by (null = all client collections) */
  role?: ClientRole | null
}

type HttpMethod = 'get' | 'post' | 'patch' | 'delete' | 'put' | 'options' | 'head'

interface OpenAPIOperation {
  'x-internal'?: boolean
  [key: string]: unknown
}

interface OpenAPIPathItem {
  get?: OpenAPIOperation
  post?: OpenAPIOperation
  patch?: OpenAPIOperation
  delete?: OpenAPIOperation
  put?: OpenAPIOperation
  options?: OpenAPIOperation
  head?: OpenAPIOperation
  [key: string]: unknown
}

export interface OpenAPISpec {
  paths?: Record<string, OpenAPIPathItem>
  [key: string]: unknown
}

/**
 * Extracts the collection or global slug from an API path
 * @example '/api/pages' -> 'pages'
 * @example '/api/pages/{id}' -> 'pages'
 * @example '/api/globals/payload-job-stats' -> 'payload-job-stats'
 */
function getCollectionFromPath(path: string): string | null {
  // Handle global paths: /api/globals/{global-slug}
  const globalMatch = path.match(/^\/api\/globals\/([^/]+)/)
  if (globalMatch) {
    return globalMatch[1]
  }

  // Handle collection paths: /api/{collection-slug}
  const collectionMatch = path.match(/^\/api\/([^/]+)/)
  return collectionMatch ? collectionMatch[1] : null
}

/**
 * Marks OpenAPI operations as internal based on configuration.
 *
 * Two-tier filtering approach:
 * 1. Always hides ALWAYS_HIDDEN_COLLECTIONS (system collections)
 * 2. When role is specified, only shows that role's collections
 *    When role is null/undefined, shows union of all client role collections
 * 3. Always hides DELETE and PATCH operations
 * 4. Hides POST operations except for ALLOW_POST_FOR collections
 *
 * Operations marked with `x-internal: true` will be hidden from
 * Scalar's documentation UI while remaining in the spec.
 *
 * @param spec - The OpenAPI specification object
 * @param options - Configuration for filtering (optional role parameter)
 * @returns Modified spec with x-internal markers added
 */
export function markInternalPaths(
  spec: OpenAPISpec,
  options: MarkerOptions = {},
): OpenAPISpec {
  const { role } = options

  if (!spec.paths) {
    return spec
  }

  // Get allowed collections based on role (or all client collections if no role)
  const allowedCollections = role ? getCollectionsForRole(role) : getAllClientCollections()

  // Deep clone to avoid mutating the original
  const markedSpec = JSON.parse(JSON.stringify(spec)) as OpenAPISpec

  for (const [path, pathItem] of Object.entries(markedSpec.paths!)) {
    const collection = getCollectionFromPath(path)

    if (!collection) {
      continue
    }

    // Check if this collection should be hidden
    const isAlwaysHidden = ALWAYS_HIDDEN_COLLECTIONS.includes(collection)
    const isNotInAllowedCollections = !allowedCollections.includes(collection)

    // Process each HTTP method
    const methods: HttpMethod[] = ['get', 'post', 'patch', 'delete', 'put', 'options', 'head']

    for (const method of methods) {
      const operation = pathItem[method]
      if (!operation) {
        continue
      }

      let shouldMark = false

      // Tier 1: Mark if collection is always hidden (system collections)
      if (isAlwaysHidden) {
        shouldMark = true
      }

      // Tier 2: Mark if collection is not in allowed collections for this role
      if (isNotInAllowedCollections) {
        shouldMark = true
      }

      // Mark if operation type is excluded (delete, patch)
      if (EXCLUDED_OPERATIONS.includes(method as (typeof EXCLUDED_OPERATIONS)[number])) {
        shouldMark = true
      }

      // Mark POST operations unless collection is in ALLOW_POST_FOR
      if (method === 'post' && !ALLOW_POST_FOR.includes(collection)) {
        shouldMark = true
      }

      if (shouldMark) {
        operation['x-internal'] = true
      }
    }
  }

  return markedSpec
}

/**
 * Legacy default configuration for backward compatibility.
 * @deprecated Use markInternalPaths with options instead
 */
export const DEFAULT_MARKER_CONFIG = {
  excludeCollections: ALWAYS_HIDDEN_COLLECTIONS,
  excludeOperations: EXCLUDED_OPERATIONS,
  allowPostFor: ALLOW_POST_FOR,
}
