import type { Config, Endpoint, PayloadRequest } from 'payload'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { openapiEndpointAuth } from '../../src/plugins/openapi/endpointAuthPlugin'

const PASSWORD = 'correcthorsebatterystaple'
const originalDocsPassword = process.env.DOCS_PASSWORD

function basicHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}

function buildProtectedHandler(handler = vi.fn(() => new Response('ok'))): Endpoint['handler'] {
  const config = openapiEndpointAuth({
    path: '/openapi-raw.json',
  })({
    endpoints: [
      {
        method: 'get',
        path: '/openapi-raw.json',
        handler,
      },
    ],
  } as Config)

  return config.endpoints![0].handler
}

function buildRequest(authHeader?: string): PayloadRequest {
  return {
    headers: new Headers(authHeader ? { authorization: authHeader } : {}),
  } as PayloadRequest
}

describe('openapiEndpointAuth', () => {
  afterEach(() => {
    if (originalDocsPassword === undefined) {
      delete process.env.DOCS_PASSWORD
    } else {
      process.env.DOCS_PASSWORD = originalDocsPassword
    }
  })

  it('passes through when DOCS_PASSWORD is not configured', async () => {
    delete process.env.DOCS_PASSWORD
    const originalHandler = vi.fn(() => new Response('ok'))
    const handler = buildProtectedHandler(originalHandler)

    const response = await handler(buildRequest())

    expect(response.status).toBe(200)
    expect(originalHandler).toHaveBeenCalledOnce()
  })

  it('rejects requests without a valid basic auth password', async () => {
    process.env.DOCS_PASSWORD = PASSWORD
    const originalHandler = vi.fn(() => new Response('ok'))
    const handler = buildProtectedHandler(originalHandler)

    const response = await handler(buildRequest(basicHeader('admin', 'wrong-password')))

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe(
      'Basic realm="Sahaj Cloud API Documentation"',
    )
    expect(originalHandler).not.toHaveBeenCalled()
  })

  it('passes through requests with the configured basic auth password', async () => {
    process.env.DOCS_PASSWORD = PASSWORD
    const originalHandler = vi.fn(() => new Response('ok'))
    const handler = buildProtectedHandler(originalHandler)

    const response = await handler(buildRequest(basicHeader('admin', PASSWORD)))

    expect(response.status).toBe(200)
    expect(originalHandler).toHaveBeenCalledOnce()
  })
})
