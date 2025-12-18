/**
 * OpenAPI Specification Endpoint
 *
 * Generates and filters the OpenAPI spec for client documentation, adding
 * `x-internal: true` markers to operations that should be hidden from the
 * Scalar documentation UI.
 *
 * Supports project-based filtering via ?project= query parameter:
 * - No project: Shows all collections accessible by any client role
 * - ?project=wemeditate-web: Shows only We Meditate Web collections
 * - ?project=wemeditate-app: Shows only We Meditate App collections
 * - ?project=sahaj-atlas: Shows only Sahaj Atlas collections
 *
 * Note: This endpoint generates the spec directly using payload-oapi internals
 * to avoid self-referential fetch issues in Cloudflare Workers (causes 522 timeout).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { generateV31Spec } from 'payload-oapi/dist/openapi/generators.js'

import { filterSpec, type OpenAPISpec } from '@/lib/openapi/specFilter'
import { isValidProject, type ProjectSlug } from '@/lib/projects'

import config from '@payload-config'


// Import the generator directly from payload-oapi internals
// This avoids the internal fetch that causes 522 timeouts in Cloudflare Workers

// Cloudflare Workers Cache API extends standard CacheStorage with a default cache
interface CloudflareCacheStorage extends CacheStorage {
  default: Cache
}

const CACHE_TTL = 300 // 5 minutes

// OpenAPI metadata - should match what's configured in payload.config.ts
const OPENAPI_METADATA = {
  title: 'Sahaj Cloud API',
  version: '1.0.0',
  description: `REST API for Sahaj Cloud CMS - We Meditate content management.

## Authentication

API clients authenticate using an API key in the Authorization header:

\`\`\`
Authorization: clients API-Key <your-api-key>
\`\`\`

API keys are generated in the Clients collection in the admin panel. Each client has specific permissions controlling which collections and operations they can access.

**Note:** The "Authorize" button in this documentation uses OAuth2 password flow for manager authentication, which is different from client API key authentication.`,
}

export async function GET(request: NextRequest) {
  try {
    // Parse project from query params
    const projectParam = request.nextUrl.searchParams.get('project')
    const project: ProjectSlug | null =
      projectParam && isValidProject(projectParam) ? (projectParam as ProjectSlug) : null

    // Create cache key including project parameter
    const cacheUrl = `https://cache.internal/openapi.json${project ? `?project=${project}` : ''}`
    const cacheKey = new Request(cacheUrl, { method: 'GET' })

    // Check Cloudflare Cache API (only available in production Workers)
    const cfCaches = typeof caches !== 'undefined' ? (caches as CloudflareCacheStorage) : null
    const cache = cfCaches?.default ?? null
    if (cache) {
      const cachedResponse = await cache.match(cacheKey)
      if (cachedResponse) {
        return cachedResponse
      }
    }

    // Generate spec directly using payload-oapi internals (no internal fetch)
    const payload = await getPayload({ config })

    // Create a request-like object for the generator
    // The generator needs: payload, protocol, headers.get('host')
    const protocol = request.nextUrl.protocol.replace(':', '')
    const host = request.headers.get('host') || request.nextUrl.host
    const mockHeaders = new Headers()
    mockHeaders.set('host', host)
    const mockReq = {
      payload,
      protocol,
      headers: mockHeaders,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawSpec = (await generateV31Spec(mockReq as any, {
      openapiVersion: '3.1',
      metadata: OPENAPI_METADATA,
      authEndpoint: '/openapi-auth', // Required by generator for security schemes
    })) as OpenAPISpec

    // Filter spec using project-based filtering
    const filteredSpec = filterSpec(rawSpec, { project })

    // Create response with cache headers
    const response = NextResponse.json(filteredSpec, {
      headers: {
        'Content-Type': 'application/json',
        // Allow caching for 5 minutes, vary by project parameter
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        Vary: 'Accept',
      },
    })

    // Store in Cloudflare Cache API (non-blocking)
    if (cache) {
      const responseToCache = response.clone()
      cache.put(cacheKey, responseToCache)
    }

    return response
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[OpenAPI] Error generating spec:', error)

    return NextResponse.json(
      { error: 'Internal server error while generating OpenAPI specification' },
      { status: 500 },
    )
  }
}
