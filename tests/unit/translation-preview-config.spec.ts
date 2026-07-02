import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { WeMeditateAppTranslations } from '@/globals/WeMeditateAppTranslations/WeMeditateAppTranslations'

/**
 * Contract for the wm-app-translations native live-preview config. The hosted
 * WeMeditate App page consumes this URL (Payload's built-in live preview), so
 * the locale + secret shape must stay stable. `url` reads process.env at call
 * time, so we swap env per case rather than re-importing.
 */
const livePreview = WeMeditateAppTranslations.admin?.livePreview
if (!livePreview || typeof livePreview.url !== 'function') {
  throw new Error('Expected admin.livePreview.url on wm-app-translations')
}
const urlFn = livePreview.url as (args: {
  locale: { code: string }
  data: Record<string, unknown>
}) => string

describe('wm-app-translations — live preview config', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env = { ...originalEnv }
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('exposes a mobile breakpoint for the native preview frame', () => {
    expect(livePreview.breakpoints?.some((b) => b.name === 'mobile')).toBe(true)
  })

  it('builds the WeMeditate App preview URL with the locale path + secret', () => {
    process.env.WEMEDITATE_APP_URL = 'https://app.example.com'
    process.env.SAHAJCLOUD_PREVIEW_SECRET = 'test-secret-0123456789'
    expect(urlFn({ locale: { code: 'fr' }, data: {} })).toBe(
      'https://app.example.com/fr/preview/wm-app-translations?secret=test-secret-0123456789',
    )
  })

  it('returns an empty url when WEMEDITATE_APP_URL is unset (graceful)', () => {
    delete process.env.WEMEDITATE_APP_URL
    expect(urlFn({ locale: { code: 'en' }, data: {} })).toBe('')
  })
})
