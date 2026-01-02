/**
 * OpenAPI Spec Filter
 *
 * Filters and transforms OpenAPI specifications for client documentation:
 * - Marks internal operations with `x-internal: true` (hidden from Scalar UI)
 * - Filters by client role permissions (project-based filtering)
 * - Injects API-Key security scheme for client authentication
 *
 * Two-tier filtering approach:
 * 1. ALWAYS_HIDDEN_COLLECTIONS - System collections always hidden from public docs
 * 2. Client role filtering - Content collections filtered by project-based implicit reads
 */

import type { CollectionSlug } from 'payload'

import { getAllProjectCollections, getProjectCollections } from '@/lib/access'
import type { ProjectSlug } from '@/payload-types'


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

export interface FilterOptions {
  /** Project/client role to filter collections by (null = all client role collections) */
  project?: ProjectSlug | null
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

interface OpenAPISecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect'
  in?: 'header' | 'query' | 'cookie'
  name?: string
  scheme?: string
  description?: string
  flows?: unknown
  [key: string]: unknown
}

interface OpenAPIComponents {
  securitySchemes?: Record<string, OpenAPISecurityScheme>
  [key: string]: unknown
}

export interface OpenAPISpec {
  paths?: Record<string, OpenAPIPathItem>
  components?: OpenAPIComponents
  security?: Array<Record<string, string[]>>
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
 * Injects the API-Key security scheme into the OpenAPI spec.
 * This scheme matches the CMS's client authentication format: `Authorization: clients API-Key <key>`
 *
 * Also removes any default OAuth2-based schemes added by payload-oapi,
 * as they don't match our API key authentication model.
 *
 * @param spec - The OpenAPI specification object
 * @returns Modified spec with API-Key security scheme added
 */
function injectSecurityScheme(spec: OpenAPISpec): OpenAPISpec {
  // Ensure components exists
  if (!spec.components) {
    spec.components = {}
  }

  // Start with existing schemes, then filter and add our own
  const existingSchemes = spec.components.securitySchemes || {}

  // Remove OAuth2-based schemes (payload-oapi adds 'ApiKey' as OAuth2 password flow)
  const filteredSchemes: Record<string, OpenAPISecurityScheme> = {}
  for (const [name, scheme] of Object.entries(existingSchemes)) {
    // Keep only non-OAuth2 schemes (removes the default 'ApiKey' password flow)
    if (scheme.type !== 'oauth2') {
      filteredSchemes[name] = scheme
    }
  }

  // Add our API-Key security scheme
  spec.components.securitySchemes = {
    ...filteredSchemes,
    'API-Key': {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description:
        'Authenticate using your API key in the Authorization header.\n\n' +
        '**Header format:** `clients API-Key YOUR_API_KEY`\n\n' +
        '**Example:** `Authorization: clients API-Key abc123xyz`\n\n' +
        'To obtain an API key, contact your administrator or visit the Clients section in the admin panel.',
    },
  }

  // Add global security requirement (all endpoints require API-Key)
  spec.security = [{ 'API-Key': [] }]

  return spec
}

/**
 * Filters an OpenAPI spec for client documentation.
 *
 * Two-tier filtering approach:
 * 1. Always hides ALWAYS_HIDDEN_COLLECTIONS (system collections)
 * 2. When project is specified, only shows that project's collections
 *    When project is null/undefined, shows union of all client role collections
 * 3. Always hides DELETE and PATCH operations
 * 4. Hides POST operations except for ALLOW_POST_FOR collections
 *
 * Operations marked with `x-internal: true` will be hidden from
 * Scalar's documentation UI while remaining in the spec.
 * Also injects the API-Key security scheme for client authentication.
 *
 * @param spec - The OpenAPI specification object
 * @param options - Configuration for filtering (optional project parameter)
 * @returns Modified spec with x-internal markers and security scheme added
 */
export function filterSpec(
  spec: OpenAPISpec,
  options: FilterOptions = {},
): OpenAPISpec {
  const { project } = options

  if (!spec.paths) {
    return spec
  }

  // Get allowed collections based on project (or all project collections if none specified)
  const allowedCollections = project
    ? getProjectCollections(project)
    : getAllProjectCollections()

  // Deep clone to avoid mutating the original
  const markedSpec = JSON.parse(JSON.stringify(spec)) as OpenAPISpec

  for (const [path, pathItem] of Object.entries(markedSpec.paths!)) {
    const collection = getCollectionFromPath(path)

    if (!collection) {
      continue
    }

    // Check if this collection should be hidden
    const isAlwaysHidden = ALWAYS_HIDDEN_COLLECTIONS.includes(collection)
    const isNotInAllowedCollections = !allowedCollections.includes(collection as CollectionSlug)

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

      // Tier 2: Mark if collection is not in allowed collections for this project
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

  // Inject API-Key security scheme for client authentication
  injectSecurityScheme(markedSpec)

  return markedSpec
}
