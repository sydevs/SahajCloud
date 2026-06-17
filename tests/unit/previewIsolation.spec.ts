import { afterEach, describe, expect, it } from 'vitest'

import {
  applyPreviewPrefix,
  isPreviewOwnedKey,
  isPreviewOwnedVideoMeta,
  isProductionDeployment,
  isProductionOrigin,
  isReapablePreviewAsset,
  isStorageIsolationActive,
  PREVIEW_ASSET_PREFIX,
  PRODUCTION_ORIGIN_HOST,
} from '@/plugins/storage/previewIsolation'

const PROD_URL = `https://${PRODUCTION_ORIGIN_HOST}`
const PREVIEW_URL = 'https://sahajcloud-pr-432.up.railway.app'

const ORIGINAL_SAHAJCLOUD_URL = process.env.SAHAJCLOUD_URL

/** Point the deployment at a given public origin for the duration of one test. */
const setOrigin = (url: string | undefined): void => {
  if (url === undefined) delete process.env.SAHAJCLOUD_URL
  else process.env.SAHAJCLOUD_URL = url
}

afterEach(() => {
  setOrigin(ORIGINAL_SAHAJCLOUD_URL)
})

describe('isProductionOrigin', () => {
  it('is true only for the canonical production host', () => {
    expect(isProductionOrigin(PROD_URL)).toBe(true)
    // Trailing path / slash do not change the host.
    expect(isProductionOrigin(`${PROD_URL}/admin`)).toBe(true)
  })

  it('is false for previews, localhost, and other hosts', () => {
    expect(isProductionOrigin(PREVIEW_URL)).toBe(false)
    expect(isProductionOrigin('http://localhost:3000')).toBe(false)
    expect(isProductionOrigin('https://staging.sydevelopers.com')).toBe(false)
    // A look-alike subdomain must not match.
    expect(isProductionOrigin('https://cloud.sydevelopers.com.evil.test')).toBe(false)
  })

  it('is false (fail-safe) for missing or unparseable URLs', () => {
    expect(isProductionOrigin(undefined)).toBe(false)
    expect(isProductionOrigin(null)).toBe(false)
    expect(isProductionOrigin('')).toBe(false)
    expect(isProductionOrigin('not a url')).toBe(false)
  })
})

describe('isProductionDeployment / isStorageIsolationActive', () => {
  it('treats the canonical prod origin as production (isolation off)', () => {
    setOrigin(PROD_URL)
    expect(isProductionDeployment()).toBe(true)
    expect(isStorageIsolationActive()).toBe(false)
  })

  it('treats a Railway preview origin as non-production (isolation on)', () => {
    setOrigin(PREVIEW_URL)
    expect(isProductionDeployment()).toBe(false)
    expect(isStorageIsolationActive()).toBe(true)
  })

  it('fails safe to non-production when the origin is unset', () => {
    setOrigin(undefined)
    expect(isProductionDeployment()).toBe(false)
    expect(isStorageIsolationActive()).toBe(true)
  })
})

describe('applyPreviewPrefix', () => {
  it('prefixes keys in non-production', () => {
    setOrigin(PREVIEW_URL)
    expect(applyPreviewPrefix('my-photo-xk2j9s')).toBe(`${PREVIEW_ASSET_PREFIX}my-photo-xk2j9s`)
  })

  it('is idempotent — never double-prefixes', () => {
    setOrigin(PREVIEW_URL)
    const once = applyPreviewPrefix('my-photo-xk2j9s')
    expect(applyPreviewPrefix(once)).toBe(once)
  })

  it('is a no-op in production', () => {
    setOrigin(PROD_URL)
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
