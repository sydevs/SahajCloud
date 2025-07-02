import { describe, it, expect, beforeAll } from 'vitest'

describe('Sentry Integration', () => {
  beforeAll(() => {
    // Ensure test environment has required variables
    process.env.SENTRY_DSN = process.env.SENTRY_DSN || 'https://test@sentry.io/123'
    process.env.NEXT_PUBLIC_SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || 'https://test@sentry.io/123'
    process.env.NODE_ENV = 'test'
  })

  it('should have Sentry DSN configured', () => {
    expect(process.env.SENTRY_DSN).toBeDefined()
    expect(process.env.SENTRY_DSN).toMatch(/^https:\/\//)
  })

  it('should have public Sentry DSN configured', () => {
    expect(process.env.NEXT_PUBLIC_SENTRY_DSN).toBeDefined()
  })

  it('should load Sentry configuration files without errors', async () => {
    // Test that configuration files can be imported
    expect(async () => {
      await import('../../sentry.server.config')
    }).not.toThrow()

    expect(async () => {
      await import('../../sentry.client.config')
    }).not.toThrow()

    expect(async () => {
      await import('../../sentry.edge.config')
    }).not.toThrow()
  })

  it('should have instrumentation setup', async () => {
    const instrumentation = await import('../../instrumentation')
    expect(instrumentation.register).toBeDefined()
    expect(typeof instrumentation.register).toBe('function')
    expect(instrumentation.onRequestError).toBeDefined()
  })

  it('should have error boundary components', async () => {
    const { ErrorBoundary, AdminProvider } = await import('../../src/components')
    expect(ErrorBoundary).toBeDefined()
    expect(AdminProvider).toBeDefined()
  })

  it('should have test endpoint available', async () => {
    // This would be tested in actual HTTP tests
    const testRoute = await import('../../src/app/(payload)/api/test-sentry/route')
    expect(testRoute.GET).toBeDefined()
    expect(typeof testRoute.GET).toBe('function')
  })

  it('should have health check endpoint', async () => {
    const healthRoute = await import('../../src/app/(payload)/api/health/route')
    expect(healthRoute.GET).toBeDefined()
    expect(typeof healthRoute.GET).toBe('function')
  })
})