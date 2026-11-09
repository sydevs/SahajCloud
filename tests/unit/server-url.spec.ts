/**
 * Which URL this deployment calls its own, and which origins may write to it.
 *
 * ⚠ **A Railway PR preview inherits production's `SAHAJCLOUD_URL`.** Two
 * separate failures come out of that, and fixing either one alone reproduces
 * the other:
 *
 * - Every link the preview composes — a sign-in link, an unsubscribe — pointed
 *   at the live site, so following one left the preview.
 * - Without the origin a reviewer's browser actually sends in Payload's `csrf`
 *   list, each write from the preview is treated as anonymous and refused 403,
 *   while page loads, which send no `Origin`, keep working.
 *
 * Through the Worker that origin is the fixed `pr-<n>` address, so both answers
 * changed together.
 *
 * ⚠ **Both read Railway's environment NAME, not its public domain.** The name is
 * what the gate and the sign-in bypass read too, so a deployment cannot compose
 * links for an address nothing serves it at. `RAILWAY_PUBLIC_DOMAIN` is still
 * `ownOrigins`' second entry, as the domain the app is literally served on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalEnv = process.env

let getServerUrl: typeof import('@/lib/utilities/serverUrl').getServerUrl
let ownOrigins: typeof import('@/lib/utilities/serverUrl').ownOrigins

async function load(env: Record<string, string | undefined>) {
  vi.resetModules()
  process.env = { ...originalEnv, ...env }
  const mod = await import('@/lib/utilities/serverUrl')
  getServerUrl = mod.getServerUrl
  ownOrigins = mod.ownOrigins
}

const PRODUCTION = 'https://cloud.sydevelopers.com'
const PREVIEW_RAILWAY_HOST = 'sahajcloud-sahajcloud-pr-874.up.railway.app'
const PREVIEW_FIXED = 'https://pr-874.cloud-preview.sydevelopers.com'

/** A Railway PR preview, as Railway names and serves one. */
const preview = {
  RAILWAY_ENVIRONMENT_NAME: 'SahajCloud-pr-874',
  RAILWAY_PUBLIC_DOMAIN: PREVIEW_RAILWAY_HOST,
  SAHAJCLOUD_URL: PRODUCTION,
}

describe('getServerUrl', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("answers a preview's own fixed address, not the production URL it inherited", async () => {
    await load(preview)

    expect(getServerUrl()).toBe(PREVIEW_FIXED)
  })

  it('answers the configured URL on production, which also has a railway.app domain', async () => {
    // ⚠ Production must keep one or every future PR environment silently gets
    // none (#661), so the suffix alone cannot decide this — the `-pr-<n>`
    // segment does.
    await load({
      RAILWAY_ENVIRONMENT_NAME: 'production',
      RAILWAY_PUBLIC_DOMAIN: 'sahajcloud-production.up.railway.app',
      SAHAJCLOUD_URL: PRODUCTION,
    })

    expect(getServerUrl()).toBe(PRODUCTION)
  })

  it('answers the configured URL on a named environment that is not a preview', async () => {
    // ⚠ The same allowlist the gate reads. A `staging` deployment is served at
    // no fixed address, so composing links for one would address nothing.
    await load({
      RAILWAY_ENVIRONMENT_NAME: 'staging',
      RAILWAY_PUBLIC_DOMAIN: 'sahajcloud-staging.up.railway.app',
      SAHAJCLOUD_URL: PRODUCTION,
    })

    expect(getServerUrl()).toBe(PRODUCTION)
  })

  it('reads the legacy RAILWAY_ENVIRONMENT too, which Railway also sets', async () => {
    // ⚠ Reading only the newer variable answered `undefined` on an environment
    // carrying only the legacy one — so the gate stood down while the login
    // page, which reads both, kept listing every account.
    await load({
      RAILWAY_ENVIRONMENT: 'pr-874',
      RAILWAY_ENVIRONMENT_NAME: undefined,
      RAILWAY_PUBLIC_DOMAIN: PREVIEW_RAILWAY_HOST,
      SAHAJCLOUD_URL: PRODUCTION,
    })

    expect(getServerUrl()).toBe(PREVIEW_FIXED)
  })

  it('answers the configured URL off Railway', async () => {
    await load({
      RAILWAY_ENVIRONMENT: undefined,
      RAILWAY_ENVIRONMENT_NAME: undefined,
      RAILWAY_PUBLIC_DOMAIN: undefined,
      SAHAJCLOUD_URL: PRODUCTION,
    })

    expect(getServerUrl()).toBe(PRODUCTION)
  })

  it('falls back to localhost with nothing configured', async () => {
    await load({
      PORT: '4000',
      RAILWAY_ENVIRONMENT: undefined,
      RAILWAY_ENVIRONMENT_NAME: undefined,
      RAILWAY_PUBLIC_DOMAIN: undefined,
      SAHAJCLOUD_URL: undefined,
    })

    expect(getServerUrl()).toBe('http://localhost:4000')
  })
})

describe('ownOrigins', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("holds both of a preview's addresses: the fixed one and Railway's own", async () => {
    // The fixed one is what a reviewer's browser sends through the Worker, and
    // it is the entry that was missing. Railway's own stays, because the app
    // still answers there for the health route.
    await load(preview)

    expect(ownOrigins()).toEqual([PREVIEW_FIXED, `https://${PREVIEW_RAILWAY_HOST}`])
  })

  it('adds the domain production is served on to the configured server URL', async () => {
    await load({
      RAILWAY_ENVIRONMENT_NAME: 'production',
      RAILWAY_PUBLIC_DOMAIN: 'sahajcloud-production.up.railway.app',
      SAHAJCLOUD_URL: PRODUCTION,
    })

    expect(ownOrigins()).toEqual([PRODUCTION, 'https://sahajcloud-production.up.railway.app'])
  })

  it('lists one origin once when the two agree', async () => {
    await load({
      RAILWAY_ENVIRONMENT_NAME: 'production',
      RAILWAY_PUBLIC_DOMAIN: 'cloud.sydevelopers.com',
      SAHAJCLOUD_URL: PRODUCTION,
    })

    expect(ownOrigins()).toEqual([PRODUCTION])
  })

  it('is the server URL alone off Railway', async () => {
    await load({
      RAILWAY_ENVIRONMENT: undefined,
      RAILWAY_ENVIRONMENT_NAME: undefined,
      RAILWAY_PUBLIC_DOMAIN: undefined,
      SAHAJCLOUD_URL: 'http://localhost:3000',
    })

    expect(ownOrigins()).toEqual(['http://localhost:3000'])
  })
})
