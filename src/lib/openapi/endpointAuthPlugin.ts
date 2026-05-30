import type { Config, Endpoint, PayloadRequest } from 'payload'

import { checkBasicAuth } from './basicAuth'

export interface OpenapiEndpointAuthOptions {
  /** Payload endpoint path to protect. */
  path?: string
  /** Enable/disable the wrapper. */
  enabled?: boolean
}

const unauthorizedResponse = () =>
  new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Sahaj Cloud API Documentation"',
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
    },
  })

export const openapiEndpointAuth =
  ({ path = '/openapi-raw.json', enabled = true }: OpenapiEndpointAuthOptions = {}) =>
  (config: Config): Config => {
    if (!enabled || !config.endpoints?.length) return config

    return {
      ...config,
      endpoints: config.endpoints.map((endpoint): Endpoint => {
        if (endpoint.method !== 'get' || endpoint.path !== path) return endpoint

        const originalHandler = endpoint.handler

        return {
          ...endpoint,
          handler: async (req: PayloadRequest) => {
            const docsPassword = process.env.DOCS_PASSWORD
            if (docsPassword) {
              const authHeader = req.headers.get('authorization') ?? ''
              if (!checkBasicAuth(authHeader, docsPassword)) {
                return unauthorizedResponse()
              }
            }

            return originalHandler(req)
          },
        }
      }),
    }
  }
