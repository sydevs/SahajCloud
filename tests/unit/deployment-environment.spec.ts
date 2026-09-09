import { afterEach, describe, expect, it, vi } from 'vitest'

import { deploymentEnvironment, railwayEnvironmentName } from '@/lib/env/deploymentEnvironment'

const ORIGINAL_ENV_NAME = process.env.RAILWAY_ENVIRONMENT_NAME
const ORIGINAL_ENV = process.env.RAILWAY_ENVIRONMENT

const restore = (
  key: 'RAILWAY_ENVIRONMENT_NAME' | 'RAILWAY_ENVIRONMENT',
  value: string | undefined,
): void => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

/** Simulate running in a given Railway environment (or off-Railway) for one test. */
const setRailwayEnv = (name: string | undefined): void => {
  delete process.env.RAILWAY_ENVIRONMENT
  if (name === undefined) delete process.env.RAILWAY_ENVIRONMENT_NAME
  else process.env.RAILWAY_ENVIRONMENT_NAME = name
}

/** `NODE_ENV` is typed read-only, so it can only be set through Vitest's stub. */
const setNodeEnv = (value: string): void => {
  vi.stubEnv('NODE_ENV', value)
}

afterEach(() => {
  restore('RAILWAY_ENVIRONMENT_NAME', ORIGINAL_ENV_NAME)
  restore('RAILWAY_ENVIRONMENT', ORIGINAL_ENV)
  vi.unstubAllEnvs()
})

describe('railwayEnvironmentName', () => {
  it('prefers RAILWAY_ENVIRONMENT_NAME', () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production'
    process.env.RAILWAY_ENVIRONMENT = 'ignored'
    expect(railwayEnvironmentName()).toBe('production')
  })

  it('falls back to the legacy RAILWAY_ENVIRONMENT', () => {
    delete process.env.RAILWAY_ENVIRONMENT_NAME
    process.env.RAILWAY_ENVIRONMENT = 'pr-7'
    expect(railwayEnvironmentName()).toBe('pr-7')
  })

  it('is undefined off-Railway', () => {
    setRailwayEnv(undefined)
    expect(railwayEnvironmentName()).toBeUndefined()
  })
})

describe('deploymentEnvironment', () => {
  // The defect in #733: Railway builds a preview with NODE_ENV=production, so
  // reading NODE_ENV tagged every preview error `production`. The environment
  // name is the only thing that separates them.
  it('names a PR preview, not production, even though NODE_ENV is production', () => {
    setRailwayEnv('pr-731')
    setNodeEnv('production')
    expect(deploymentEnvironment()).toBe('pr-731')
  })

  it('still reports production on the production deployment', () => {
    setRailwayEnv('production')
    setNodeEnv('production')
    expect(deploymentEnvironment()).toBe('production')
  })

  it('reads the legacy RAILWAY_ENVIRONMENT for a preview too', () => {
    delete process.env.RAILWAY_ENVIRONMENT_NAME
    process.env.RAILWAY_ENVIRONMENT = 'pr-42'
    setNodeEnv('production')
    expect(deploymentEnvironment()).toBe('pr-42')
  })

  // Off-Railway there is no environment name, so NODE_ENV is the honest answer.
  // A distinguishable value, not the fallback's own, so this cannot pass
  // vacuously against a helper that ignored NODE_ENV entirely.
  it('falls back to NODE_ENV off-Railway, keeping a local run `development`', () => {
    setRailwayEnv(undefined)
    setNodeEnv('development')
    expect(deploymentEnvironment()).toBe('development')
  })

  it('reports whatever NODE_ENV says off-Railway', () => {
    setRailwayEnv(undefined)
    setNodeEnv('test')
    expect(deploymentEnvironment()).toBe('test')
  })
})
