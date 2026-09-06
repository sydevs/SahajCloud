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
 * to avoid a self-referential fetch when generating the spec. Response caching is
 * handled at the Cloudflare edge (Cache Rules + the Cache-Control header).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { generateV31Spec } from 'payload-oapi/dist/openapi/generators.js'

import type { ProjectSlug } from '@/payload-types'
import { isValidProject } from '@/plugins/access'
import { checkBasicAuth } from '@/plugins/openapi/basicAuth'
import { CUSTOM_ENDPOINT_PATHS, CUSTOM_ENDPOINT_SCHEMAS } from '@/plugins/openapi/customEndpoints'
import { filterSpec, rootEndpointPathsFrom, type OpenAPISpec } from '@/plugins/openapi/specFilter'

import config from '@payload-config'

// generateV31Spec is imported directly from payload-oapi internals to avoid an
// internal self-referential fetch when generating the spec.

const CACHE_TTL = 300 // 5 minutes

// OpenAPI metadata - should match what's configured in payload.config.ts
const OPENAPI_METADATA = {
  title: 'Sahaj Cloud API',
  version: '1.0.0',
  description: `REST API for Sahaj Cloud CMS - We Meditate content management.`,
}

export async function GET(request: NextRequest) {
  try {
    const docsPassword = process.env.DOCS_PASSWORD
    if (docsPassword) {
      const authHeader = request.headers.get('authorization') ?? ''
      if (!checkBasicAuth(authHeader, docsPassword)) {
        return new NextResponse('Authentication required', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Sahaj Cloud API Documentation"',
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-store',
          },
        })
      }
    }

    // Parse project from query params
    const projectParam = request.nextUrl.searchParams.get('project')
    const project: ProjectSlug | null =
      projectParam && isValidProject(projectParam) ? projectParam : null

    // Generate spec directly using payload-oapi internals (no internal fetch).
    // Edge caching is handled by Cloudflare (Cache Rules / the Cache-Control
    // header below) in front of the Railway origin — there is no in-app cache.
    const payload = await getPayload({ config })

    // Create a request-like object for the generator
    // The generator needs: payload, protocol, headers.get('host')
    const protocol = request.nextUrl.protocol
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

    // Inject custom endpoint paths + schemas before filtering so project-based
    // visibility in filterSpec applies them automatically by collection slug.
    // See src/plugins/openapi/customEndpoints.ts for the shape rationale.
    rawSpec.paths = { ...(rawSpec.paths ?? {}), ...CUSTOM_ENDPOINT_PATHS }
    rawSpec.components ??= {}
    rawSpec.components.schemas = {
      ...((rawSpec.components.schemas as Record<string, unknown> | undefined) ?? {}),
      ...CUSTOM_ENDPOINT_SCHEMAS,
    }

    // Filter spec using project-based filtering. Root endpoints
    // (`config.endpoints`) belong to no collection, so their paths are derived
    // from the live config and exempted — see `rootEndpointPathsFrom`.
    const filteredSpec = filterSpec(rawSpec, {
      project,
      rootEndpointPaths: rootEndpointPathsFrom(payload.config.endpoints),
    })

    // Create response with cache headers
    const response = NextResponse.json(filteredSpec, {
      headers: {
        'Content-Type': 'application/json',
        // Don't cache password-protected responses publicly
        'Cache-Control': docsPassword ? 'private, no-store' : `public, max-age=${CACHE_TTL}`,
        Vary: 'Accept',
      },
    })

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
