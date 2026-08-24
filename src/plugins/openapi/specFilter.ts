/**
 * OpenAPI Spec Filter
 *
 * Filters and transforms OpenAPI specifications for client documentation:
 * - Marks internal operations with `x-internal: true` (hidden from Scalar UI)
 * - Filters by client role permissions (project-based filtering)
 * - Injects API-Key security scheme for client authentication
 *
 * Three-tier filtering approach:
 * 1. ALWAYS_HIDDEN_COLLECTIONS - System collections always hidden from public docs
 * 2. Client role filtering - Content collections filtered by project-based implicit reads
 * 3. CUSTOM_ENDPOINTS_ONLY_COLLECTIONS - Base CRUD paths hidden; custom subpaths remain visible
 */

import type { CollectionSlug } from 'payload'

import type { ProjectSlug } from '@/payload-types'
import { getAllProjectCollections, getProjectCollections } from '@/plugins/access'
import type { ContentSlug } from '@/plugins/access/types'

import {
  CLIENT_READ_PARAMETERS,
  FIND_BY_ID_PARAMETERS,
  LIST_PARAMETERS,
} from './clientReadParametersDocs'
import { xUserIdParameter } from './rateLimitingDocs'

/**
 * Collections that are ALWAYS hidden from public API docs regardless of role.
 * These are system/internal collections that should never be exposed.
 */
export const ALWAYS_HIDDEN_COLLECTIONS: ContentSlug[] = [
  // Access collections - internal user management
  'managers',
  'clients',

  // System collections - internal file storage
  'images',
  'files',

  // Payload internal collections
  'payload-kv',
  'payload-jobs',
  'payload-locked-documents',
  'payload-preferences',
  'payload-migrations',
  'payload-jobs-stats',
]

/**
 * Collections whose base CRUD paths (/api/{slug} and /api/{slug}/{id}) are
 * hidden from public docs, but whose custom subpaths (/for-audience, etc.)
 * remain visible. API clients should use only the curated custom endpoints.
 */
export const CUSTOM_ENDPOINTS_ONLY_COLLECTIONS: ContentSlug[] = ['lectures', 'app-cards']

/**
 * HTTP operations excluded from public docs.
 * API clients only have read access (plus form-submissions POST).
 */
export const EXCLUDED_OPERATIONS = ['delete', 'patch'] as const

/**
 * Collections allowed to have POST operations visible.
 * These are collections where API clients can create new documents.
 */
export const ALLOW_POST_FOR: CollectionSlug[] = ['form-submissions', 'event-submissions']

export interface FilterOptions {
  /** Project/client role to filter collections by (null = all client role collections) */
  project?: ProjectSlug | null
  /**
   * Spec paths served by **root** endpoints (`config.endpoints`), which belong to
   * no collection and so can't be judged by the project-visibility tiers. They're
   * exempted from filtering and stay visible in every project's spec.
   * Build with {@link rootEndpointPathsFrom}; omitting it means "no root
   * endpoints", which would hide any that exist.
   */
  rootEndpointPaths?: string[]
}

type HttpMethod = 'get' | 'post' | 'patch' | 'delete' | 'put' | 'options' | 'head'

interface OpenAPIOperation {
  'x-internal'?: boolean
  parameters?: Array<{ $ref?: string; [key: string]: unknown }>
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

interface OpenAPIParameter {
  name: string
  in: 'header' | 'query' | 'path' | 'cookie'
  required?: boolean
  schema?: Record<string, unknown>
  description?: string
  [key: string]: unknown
}

interface OpenAPIComponents {
  securitySchemes?: Record<string, OpenAPISecurityScheme>
  parameters?: Record<string, OpenAPIParameter>
  [key: string]: unknown
}

export interface OpenAPISpec {
  paths?: Record<string, OpenAPIPathItem>
  components?: OpenAPIComponents
  security?: Array<Record<string, string[]>>
  [key: string]: unknown
}

/**
 * Turn a Payload config's root `endpoints` into the `/api/…` path keys they
 * occupy in the spec.
 *
 * A **root** endpoint (registered on `config.endpoints` rather than on a
 * collection) has a first path segment that looks like a collection slug but
 * names no collection, so the project-visibility tiers below can't judge it —
 * and would hide every one as "not in this project's collections". Passing the
 * result to {@link filterSpec} as `rootEndpointPaths` exempts them, which is
 * right: a root endpoint is project-agnostic by nature (`/api/contact-admin` is
 * shared by every client app).
 *
 * Derived from the live config rather than a hand-kept list, so adding an
 * endpoint to `config.endpoints` is the only edit needed to keep `/api/docs`
 * honest.
 */
export function rootEndpointPathsFrom(
  endpoints: { path: string }[] | false | undefined,
  apiRoute = '/api',
): string[] {
  if (!endpoints) return []
  return endpoints.map((endpoint) => `${apiRoute}${endpoint.path}`)
}

/**
 * Extracts the collection or global slug from an API path
 * @example '/api/pages' -> 'pages'
 * @example '/api/pages/{id}' -> 'pages'
 * @example '/api/globals/payload-job-stats' -> 'payload-job-stats'
 * @example '/api/contact-admin' -> null (when listed in `rootPaths`)
 */
function getCollectionFromPath(path: string, rootPaths: Set<string>): string | null {
  // Root-level endpoints belong to no collection — returning null keeps them
  // out of the visibility tiers entirely (the filter loop skips them).
  if (rootPaths.has(path)) {
    return null
  }

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
 * Injects the X-User-ID parameter into the OpenAPI spec.
 * This parameter is used for per-user rate limiting to provide isolated quotas.
 *
 * The parameter is:
 * 1. Added to spec.components.parameters as a reusable definition
 * 2. Referenced in all non-internal GET operations
 *
 * @param spec - The OpenAPI specification object
 * @returns Modified spec with X-User-ID parameter injected
 */
function injectRateLimitingParameter(spec: OpenAPISpec): OpenAPISpec {
  // Ensure components exists
  if (!spec.components) {
    spec.components = {}
  }

  // Ensure parameters exists
  if (!spec.components.parameters) {
    spec.components.parameters = {}
  }

  // Add X-User-ID parameter definition
  spec.components.parameters['X-User-ID'] = xUserIdParameter

  // Add $ref to all non-internal GET operations
  if (spec.paths) {
    for (const pathItem of Object.values(spec.paths)) {
      const operation = pathItem.get
      if (operation && !operation['x-internal']) {
        // Initialize parameters array if not present
        if (!operation.parameters) {
          operation.parameters = []
        }

        // Add X-User-ID reference if not already present
        const hasXUserId = operation.parameters.some(
          (p) => p.$ref === '#/components/parameters/X-User-ID',
        )
        if (!hasXUserId) {
          operation.parameters.push({ $ref: '#/components/parameters/X-User-ID' })
        }
      }
    }
  }

  return spec
}

/**
 * Recognizes auto-generated collection CRUD paths so we only inject client-read
 * params there (not on custom subpath endpoints like `/for-audience`, which have
 * hand-authored parameter lists).
 *
 * - List GET: `/api/{collection}` (no trailing segment)
 * - FindByID GET: `/api/{collection}/{id}` (single brace-bracketed segment)
 *
 * `/api/globals/*` paths are deliberately excluded — they have their own param
 * surface and don't accept the same shape.
 */
function classifyCollectionGetPath(path: string): 'list' | 'findById' | null {
  if (path.startsWith('/api/globals/')) return null
  if (/^\/api\/[^/]+$/.test(path)) return 'list'
  if (/^\/api\/[^/]+\/\{[^}]+\}$/.test(path)) return 'findById'
  return null
}

/** True for an auto-generated base collection path like `/api/events` (its CRUD root). */
function isBaseCollectionPath(path: string): boolean {
  return /^\/api\/[^/]+$/.test(path)
}

/**
 * Injects `select` / `populate` / `depth` / `limit` / `page` parameters into
 * collection list + findByID GET operations.
 *
 * `payload-oapi` v0.2.5 doesn't surface these params in the auto-generated
 * spec, so Scalar's request-builder panel shows nothing about them. This
 * walks the filtered spec and adds `$ref`s so clients can discover the
 * bracket-notation format (the source of the #419 confusion).
 *
 * Mirrors `injectRateLimitingParameter()` below — the same walk-and-inject
 * pattern. Only attaches to GET operations not marked `x-internal: true` and
 * not on `/api/globals/*` or custom subpaths.
 */
function injectClientReadParameters(spec: OpenAPISpec): OpenAPISpec {
  if (!spec.components) spec.components = {}
  if (!spec.components.parameters) spec.components.parameters = {}

  // Register reusable parameter definitions under components.parameters
  for (const [name, definition] of Object.entries(CLIENT_READ_PARAMETERS)) {
    spec.components.parameters[name] = definition as OpenAPIParameter
  }

  if (!spec.paths) return spec

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const operation = pathItem.get
    if (!operation || operation['x-internal']) continue

    const kind = classifyCollectionGetPath(path)
    if (!kind) continue

    if (!operation.parameters) operation.parameters = []

    const paramNames = kind === 'list' ? LIST_PARAMETERS : FIND_BY_ID_PARAMETERS
    for (const name of paramNames) {
      const ref = `#/components/parameters/${name}`
      const alreadyPresent = operation.parameters.some((p) => p.$ref === ref)
      if (!alreadyPresent) {
        operation.parameters.push({ $ref: ref })
      }
    }
  }

  return spec
}

/**
 * Filters an OpenAPI spec for client documentation.
 *
 * Three-tier filtering approach:
 * 1. Always hides ALWAYS_HIDDEN_COLLECTIONS (system collections)
 * 2. When project is specified, only shows that project's collections
 *    When project is null/undefined, shows union of all client role collections
 * 3. Hides base CRUD paths for CUSTOM_ENDPOINTS_ONLY_COLLECTIONS; custom subpaths remain visible
 * Also hides DELETE and PATCH operations; hides POST except for ALLOW_POST_FOR collections
 *
 * Operations marked with `x-internal: true` will be hidden from
 * Scalar's documentation UI while remaining in the spec.
 * Also injects the API-Key security scheme for client authentication.
 *
 * @param spec - The OpenAPI specification object
 * @param options - Configuration for filtering (optional project parameter)
 * @returns Modified spec with x-internal markers and security scheme added
 */
export function filterSpec(spec: OpenAPISpec, options: FilterOptions = {}): OpenAPISpec {
  const { project, rootEndpointPaths = [] } = options

  if (!spec.paths) {
    return spec
  }

  const rootPaths = new Set(rootEndpointPaths)

  // Get allowed collections based on project (or all project collections if none specified)
  const allowedCollections = project ? getProjectCollections(project) : getAllProjectCollections()

  // Deep clone to avoid mutating the original
  const markedSpec = JSON.parse(JSON.stringify(spec)) as OpenAPISpec

  for (const [path, pathItem] of Object.entries(markedSpec.paths!)) {
    const collection = getCollectionFromPath(path, rootPaths)

    if (!collection) {
      continue
    }

    // Check if this collection should be hidden
    const isAlwaysHidden = ALWAYS_HIDDEN_COLLECTIONS.includes(collection as ContentSlug)
    const isNotInAllowedCollections = !allowedCollections.includes(collection as ContentSlug)
    // Tier 3: base CRUD paths hidden for collections served only via custom subpaths.
    // Matches /api/{collection} and /api/{collection}/{id} but NOT /api/{collection}/for-audience.
    const isBaseCrudPath =
      CUSTOM_ENDPOINTS_ONLY_COLLECTIONS.includes(collection as ContentSlug) &&
      /^\/api\/[^/]+(\/{[^}]+})?$/.test(path)

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

      // Tier 3: Mark base CRUD paths for custom-endpoints-only collections
      if (isBaseCrudPath) {
        shouldMark = true
      }

      // Mark if operation type is excluded (delete, patch)
      if (EXCLUDED_OPERATIONS.includes(method as (typeof EXCLUDED_OPERATIONS)[number])) {
        shouldMark = true
      }

      // Mark the auto-generated base-collection POST (create) unless the
      // collection is in ALLOW_POST_FOR. Hand-authored custom POST subpaths
      // (e.g. /api/events/register) are deliberately documented and stay visible.
      if (
        method === 'post' &&
        isBaseCollectionPath(path) &&
        !ALLOW_POST_FOR.includes(collection as CollectionSlug)
      ) {
        shouldMark = true
      }

      if (shouldMark) {
        operation['x-internal'] = true
      }
    }
  }

  // Inject API-Key security scheme for client authentication
  injectSecurityScheme(markedSpec)

  // Inject X-User-ID parameter for rate limiting (only to non-internal GET operations)
  injectRateLimitingParameter(markedSpec)

  // Inject select/populate/depth/limit/page on collection list + findByID GETs
  injectClientReadParameters(markedSpec)

  // Sort paths alphabetically for stable, human-readable output
  if (markedSpec.paths) {
    markedSpec.paths = Object.fromEntries(
      Object.entries(markedSpec.paths).sort(([a], [b]) => a.localeCompare(b)),
    ) as Record<string, OpenAPIPathItem>
  }

  return markedSpec
}
