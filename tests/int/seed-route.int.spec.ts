/**
 * Integration tests for the seed route parameter validation.
 *
 * Tests that the seed route properly validates pagination parameters
 * (offset, limit) before processing.
 */
import { describe, expect, it } from 'vitest'

describe('Seed route parameter validation', () => {
  // These tests verify that the seed route rejects invalid pagination parameters
  // with a 400 response before attempting to process them.

  it('rejects non-integer offset parameter with 400', async () => {
    // A non-numeric offset should be rejected
    const response = await fetch(
      'http://localhost:3000/api/seed/test?collection=meditations&offset=abc&limit=10',
    )

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error?: string }
    expect(body.error).toContain('Invalid offset parameter')
  })

  it('rejects negative offset parameter with 400', async () => {
    // A negative offset should be rejected
    const response = await fetch(
      'http://localhost:3000/api/seed/test?collection=meditations&offset=-1&limit=10',
    )

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error?: string }
    expect(body.error).toContain('Invalid offset parameter')
  })

  it('rejects non-integer limit parameter with 400', async () => {
    // A non-numeric limit should be rejected
    const response = await fetch(
      'http://localhost:3000/api/seed/test?collection=meditations&offset=0&limit=xyz',
    )

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error?: string }
    expect(body.error).toContain('Invalid limit parameter')
  })

  it('rejects negative limit parameter with 400', async () => {
    // A negative limit should be rejected
    const response = await fetch(
      'http://localhost:3000/api/seed/test?collection=meditations&offset=0&limit=-5',
    )

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error?: string }
    expect(body.error).toContain('Invalid limit parameter')
  })

  it('accepts valid non-negative integer offset and limit', async () => {
    // Valid parameters should not be rejected for validation reasons
    // (they may fail for other reasons like script not found, but not for parameter validation)
    const response = await fetch(
      'http://localhost:3000/api/seed/nonexistent-script?collection=meditations&offset=10&limit=20',
    )

    // Should not return 400 for parameter validation
    expect(response.status).not.toBe(400)
  })
})
