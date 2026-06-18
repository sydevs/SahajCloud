import { afterEach, describe, expect, it } from 'vitest'

import {
  applyPreviewPrefix,
  isPreviewOwnedKey,
  isPreviewOwnedVideoMeta,
  isProductionDeployment,
  isReapablePreviewAsset,
  isStorageIsolationActive,
  PREVIEW_ASSET_PREFIX,
  PRODUCTION_ENVIRONMENT_NAME,
  railwayEnvironmentName,
} from '@/plugins/storage/previewIsolation'

const PREVIEW_ENV = 'pr-432'

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

afterEach(() => {
  restore('RAILWAY_ENVIRONMENT_NAME', ORIGINAL_ENV_NAME)
  restore('RAILWAY_ENVIRONMENT', ORIGINAL_ENV)
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

describe('isProductionDeployment / isStorageIsolationActive', () => {
  it('treats the production environment as production (isolation off)', () => {
    setRailwayEnv(PRODUCTION_ENVIRONMENT_NAME)
    expect(isProductionDeployment()).toBe(true)
    expect(isStorageIsolationActive()).toBe(false)
  })

  it('treats a pr-* preview environment as non-production (isolation on)', () => {
    setRailwayEnv(PREVIEW_ENV)
    expect(isProductionDeployment()).toBe(false)
    expect(isStorageIsolationActive()).toBe(true)
  })

  it('fails safe to non-production off-Railway (no env name)', () => {
    setRailwayEnv(undefined)
    expect(isProductionDeployment()).toBe(false)
    expect(isStorageIsolationActive()).toBe(true)
  })
})

describe('applyPreviewPrefix', () => {
  it('prefixes keys in non-production', () => {
    setRailwayEnv(PREVIEW_ENV)
    expect(applyPreviewPrefix('my-photo-xk2j9s')).toBe(`${PREVIEW_ASSET_PREFIX}my-photo-xk2j9s`)
  })

  it('is idempotent — never double-prefixes', () => {
    setRailwayEnv(PREVIEW_ENV)
    const once = applyPreviewPrefix('my-photo-xk2j9s')
    expect(applyPreviewPrefix(once)).toBe(once)
  })

  it('is a no-op in production', () => {
    setRailwayEnv(PRODUCTION_ENVIRONMENT_NAME)
    expect(applyPreviewPrefix('my-photo-xk2j9s')).toBe('my-photo-xk2j9s')
  })
})

describe('isPreviewOwnedKey', () => {
  it('recognizes preview-marked keys only', () => {
    expect(isPreviewOwnedKey('preview-my-photo-xk2j9s')).toBe(true)
    expect(isPreviewOwnedKey('my-photo-xk2j9s')).toBe(false)
    expect(isPreviewOwnedKey('my-audio-file-1-xk2j9s.mp3')).toBe(false)
  })
})

describe('isPreviewOwnedVideoMeta', () => {
  it('recognizes the preview meta tag only', () => {
    expect(isPreviewOwnedVideoMeta({ env: 'preview' })).toBe(true)
    expect(isPreviewOwnedVideoMeta({ env: 'production' })).toBe(false)
    expect(isPreviewOwnedVideoMeta({ name: 'something' })).toBe(false)
    expect(isPreviewOwnedVideoMeta({})).toBe(false)
    expect(isPreviewOwnedVideoMeta(undefined)).toBe(false)
    expect(isPreviewOwnedVideoMeta(null)).toBe(false)
  })
})

describe('isReapablePreviewAsset', () => {
  const now = new Date('2026-06-17T12:00:00Z')
  const eightDaysAgo = new Date('2026-06-09T12:00:00Z')
  const oneDayAgo = new Date('2026-06-16T12:00:00Z')

  it('NEVER reaps a non-preview (production) asset, regardless of age', () => {
    expect(isReapablePreviewAsset(false, eightDaysAgo, now, 7)).toBe(false)
  })

  it('NEVER reaps an asset of unknown age', () => {
    expect(isReapablePreviewAsset(true, null, now, 7)).toBe(false)
  })

  it('reaps a preview asset older than the cutoff', () => {
    expect(isReapablePreviewAsset(true, eightDaysAgo, now, 7)).toBe(true)
  })

  it('keeps a preview asset younger than the cutoff', () => {
    expect(isReapablePreviewAsset(true, oneDayAgo, now, 7)).toBe(false)
  })

  it('reaps at exactly the cutoff age (inclusive)', () => {
    const exactlySevenDaysAgo = new Date('2026-06-10T12:00:00Z')
    expect(isReapablePreviewAsset(true, exactlySevenDaysAgo, now, 7)).toBe(true)
  })
})
