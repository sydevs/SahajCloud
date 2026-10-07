/**
 * Which origins a cookie-authenticated request may come from.
 *
 * ⚠ **A Railway PR preview inherits production's `SAHAJCLOUD_URL`.** Without
 * its own public domain in Payload's `csrf` list, every admin write from the
 * preview is treated as anonymous and refused.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalEnv = process.env

let ownOrigins: typeof import('@/lib/utilities/serverUrl').ownOrigins

async function load(env: Record<string, string | undefined>) {
  vi.resetModules()
  process.env = { ...originalEnv, ...env }
  ownOrigins = (await import('@/lib/utilities/serverUrl')).ownOrigins
}

describe('ownOrigins', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('adds the domain a preview is served on to the configured server URL', async () => {
    await load({
      SAHAJCLOUD_URL: 'https://cloud.sydevelopers.com',
      RAILWAY_PUBLIC_DOMAIN: 'sahajcloud-sahajcloud-pr-874.up.railway.app',
    })
    expect(ownOrigins()).toEqual([
      'https://cloud.sydevelopers.com',
      'https://sahajcloud-sahajcloud-pr-874.up.railway.app',
    ])
  })

  it('lists one origin once when the two agree', async () => {
    await load({
      SAHAJCLOUD_URL: 'https://cloud.sydevelopers.com',
      RAILWAY_PUBLIC_DOMAIN: 'cloud.sydevelopers.com',
    })
    expect(ownOrigins()).toEqual(['https://cloud.sydevelopers.com'])
  })

  it('is the server URL alone off Railway', async () => {
    await load({ SAHAJCLOUD_URL: 'http://localhost:3000', RAILWAY_PUBLIC_DOMAIN: undefined })
    expect(ownOrigins()).toEqual(['http://localhost:3000'])
  })
})
