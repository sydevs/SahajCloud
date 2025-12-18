/**
 * OpenAPI Spec Marker Utility
 *
 * Adds `x-internal: true` markers to OpenAPI operations that should be hidden
 * from the Scalar documentation UI. Scalar respects this extension and hides
 * marked operations from the public documentation.
 */

export interface MarkerOptions {
  /** Collection slugs to completely hide from documentation */
  excludeCollections: string[]
  /** HTTP methods to hide from all collections */
  excludeOperations: ('get' | 'post' | 'patch' | 'delete')[]
  /** Collections that should keep POST operations visible */
  allowPostFor: string[]
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
 * Default configuration for marking internal paths
 */
export const DEFAULT_MARKER_CONFIG: MarkerOptions = {
  excludeCollections: [
    // Access collections
    'managers',
    'clients',
    // System collections
    'images',
    'files',
    'image-tags',
    // Payload internal collections and globals
    'payload-kv',
    'payload-jobs',
    'payload-locked-documents',
    'payload-preferences',
    'payload-migrations',
    'payload-job-stats', // Global, but may have API paths
  ],
  excludeOperations: ['delete', 'patch'],
  allowPostFor: ['form-submissions'],
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
 * Operations marked with `x-internal: true` will be hidden from
 * Scalar's documentation UI while remaining in the spec.
 *
 * @param spec - The OpenAPI specification object
 * @param options - Configuration for which paths/operations to mark
 * @returns Modified spec with x-internal markers added
 */
export function markInternalPaths(
  spec: OpenAPISpec,
  options: MarkerOptions = DEFAULT_MARKER_CONFIG,
): OpenAPISpec {
  const { excludeCollections, excludeOperations, allowPostFor } = options

  if (!spec.paths) {
    return spec
  }

  // Deep clone to avoid mutating the original
  const markedSpec = JSON.parse(JSON.stringify(spec)) as OpenAPISpec

  for (const [path, pathItem] of Object.entries(markedSpec.paths!)) {
    const collection = getCollectionFromPath(path)

    if (!collection) {
      continue
    }

    // Check if this collection should be completely hidden
    const isExcludedCollection = excludeCollections.includes(collection)

    // Process each HTTP method
    const methods: HttpMethod[] = ['get', 'post', 'patch', 'delete', 'put', 'options', 'head']

    for (const method of methods) {
      const operation = pathItem[method]
      if (!operation) {
        continue
      }

      let shouldMark = false

      // Mark if collection is excluded
      if (isExcludedCollection) {
        shouldMark = true
      }

      // Mark if operation type is excluded (e.g., delete, patch)
      if (excludeOperations.includes(method as 'get' | 'post' | 'patch' | 'delete')) {
        shouldMark = true
      }

      // Mark POST operations unless collection is in allowPostFor
      if (method === 'post' && !allowPostFor.includes(collection)) {
        shouldMark = true
      }

      if (shouldMark) {
        operation['x-internal'] = true
      }
    }
  }

  return markedSpec
}
