import { afterEach, describe, expect, it, vi } from 'vitest'

// The int spec mocks this helper away, and the env spec pins the schema. Without
// this file nothing joins the two, so a rename on either side stays green while
// the pause silently stops working.
const env = {
  NODE_ENV: 'test',
  PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/payload_test',
  WEMEDITATE_WEB_URL: 'https://wemeditate.example.com',
  SAHAJATLAS_URL: 'https://atlas.example.com',
} as const

describe('isEventVerificationEnabled', () => {
  const originalEnv = process.env

  afterEach(() => {
    vi.resetModules()
    process.env = originalEnv
  })

  it('runs the sweep when EVENT_VERIFICATION_ENABLED is unset', async () => {
    process.env = { ...env }
    const { isEventVerificationEnabled } = await import('../../src/jobs/ExpireEvents/featureFlag')

    expect(isEventVerificationEnabled()).toBe(true)
  })

  it('pauses the sweep when EVENT_VERIFICATION_ENABLED is false', async () => {
    process.env = { ...env, EVENT_VERIFICATION_ENABLED: 'false' }
    const { isEventVerificationEnabled } = await import('../../src/jobs/ExpireEvents/featureFlag')

    expect(isEventVerificationEnabled()).toBe(false)
  })
})
