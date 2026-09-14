import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clientDeploymentEnvironment,
  deploymentEnvironment,
} from '@/lib/env/deploymentEnvironment'

/**
 * The browser half of #733's fix (#737).
 *
 * A browser bundle reads no environment at runtime, so the deployment name
 * only reaches it if `next.config.mjs` inlines it under a `NEXT_PUBLIC_*` key.
 * Two things therefore have to hold, and the second is the one a pure test
 * cannot see: the helper reads the right key, **and** the config actually
 * publishes it.
 */

const KEY = 'NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT'

const ORIGINAL = {
  [KEY]: process.env[KEY],
  RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
  RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
}

const set = (key: string, value: string | undefined): void => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) set(key, value)
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('clientDeploymentEnvironment', () => {
  // The defect: a browser error from a PR preview was tagged `production`,
  // because NODE_ENV is `production` on every Railway build (#733, #737).
  it('names the preview the bundle was built for, not production', () => {
    set(KEY, 'pr-737')
    vi.stubEnv('NODE_ENV', 'production')
    expect(clientDeploymentEnvironment()).toBe('pr-737')
  })

  it('still reports production on the production build', () => {
    set(KEY, 'production')
    vi.stubEnv('NODE_ENV', 'production')
    expect(clientDeploymentEnvironment()).toBe('production')
  })

  // The second belt, for a bundle built before the config entry existed. The
  // fallback value is distinguishable from the key's, so this cannot pass
  // against a helper that ignores the public key entirely.
  it('falls back to NODE_ENV when the build published no name', () => {
    set(KEY, undefined)
    vi.stubEnv('NODE_ENV', 'development')
    expect(clientDeploymentEnvironment()).toBe('development')
  })
})

describe('next.config.mjs publishes the deployment name', () => {
  /**
   * ⚠ This imports the real config, on purpose. `clientDeploymentEnvironment`
   * can be perfectly correct and still read `undefined` in every browser, if
   * nothing inlines the key — the wiring is the half no pure spec covers.
   *
   * It also pins the config's chain against `deploymentEnvironment()`. A
   * `.mjs` config cannot import the TypeScript helper, so the chain is written
   * twice; this assertion is what stops the copies drifting apart.
   */
  it('inlines the Railway environment name, agreeing with the server helper', async () => {
    set('RAILWAY_ENVIRONMENT_NAME', 'pr-737')
    set('RAILWAY_ENVIRONMENT', undefined)
    vi.stubEnv('NODE_ENV', 'production')

    vi.resetModules()
    const { default: config } = await import('../../next.config.mjs')

    expect(config.env?.[KEY]).toBe('pr-737')
    expect(config.env?.[KEY]).toBe(deploymentEnvironment())
  })

  // The legacy variable is the half most likely to be dropped from one copy.
  it('reads the legacy RAILWAY_ENVIRONMENT too, as the helper does', async () => {
    set('RAILWAY_ENVIRONMENT_NAME', undefined)
    set('RAILWAY_ENVIRONMENT', 'pr-42')
    vi.stubEnv('NODE_ENV', 'production')

    vi.resetModules()
    const { default: config } = await import('../../next.config.mjs')

    expect(config.env?.[KEY]).toBe('pr-42')
    expect(config.env?.[KEY]).toBe(deploymentEnvironment())
  })

  // Off-Railway, so a local build still tags a browser error `development`.
  it('falls through to NODE_ENV off-Railway, like the server helper', async () => {
    set('RAILWAY_ENVIRONMENT_NAME', undefined)
    set('RAILWAY_ENVIRONMENT', undefined)
    vi.stubEnv('NODE_ENV', 'development')

    vi.resetModules()
    const { default: config } = await import('../../next.config.mjs')

    expect(config.env?.[KEY]).toBe('development')
    expect(config.env?.[KEY]).toBe(deploymentEnvironment())
  })

  /**
   * ⚠ The case above cannot see a fourth link. A config chain ending
   * `?? 'development'` returns `development` there too, whatever the code
   * does — the `read() ?? fallback` trap. Only an unset `NODE_ENV` separates
   * them, and parity with the server helper is the whole point: both answer
   * `undefined`, which `deploymentEnvironment()`'s own ⚠ explains.
   */
  it('adds no fourth link the server helper lacks', async () => {
    set('RAILWAY_ENVIRONMENT_NAME', undefined)
    set('RAILWAY_ENVIRONMENT', undefined)
    vi.stubEnv('NODE_ENV', undefined)

    vi.resetModules()
    const { default: config } = await import('../../next.config.mjs')

    expect(config.env?.[KEY]).toBeUndefined()
    expect(config.env?.[KEY]).toBe(deploymentEnvironment())
  })
})
