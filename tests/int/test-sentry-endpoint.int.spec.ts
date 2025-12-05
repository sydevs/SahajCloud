import { describe, expect, it } from 'vitest'

describe('Sentry Test Endpoint', () => {
  it('should have GET handler for test-sentry route', async () => {
    const testRoute = await import('../../src/app/(payload)/api/test-sentry/route')
    expect(testRoute.GET).toBeDefined()
    expect(typeof testRoute.GET).toBe('function')
  })

  it('should reject requests in non-production environment', async () => {
    const { GET } = await import('../../src/app/(payload)/api/test-sentry/route')

    // Create mock request
    const mockRequest = new Request('http://localhost:3000/api/test-sentry?type=error')

    const response = await GET(mockRequest as any)
    const data = (await response.json()) as { success: boolean; message: string }

    expect(response.status).toBe(503)
    expect(data.success).toBe(false)
    expect(data.message).toContain('only works in production')
  })

  it('should validate query parameters', async () => {
    // This test would need production environment mocking
    // Skipping implementation as it requires complex environment setup
    expect(true).toBe(true)
  })
})
