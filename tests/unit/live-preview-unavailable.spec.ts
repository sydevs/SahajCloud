import { describe, expect, it } from 'vitest'

import { livePreviewUnavailableUrl } from '@/lib/livePreview/unavailable'

/**
 * The panel's fallback URL. Its one job is to be a real, same-origin URL that
 * renders an explanation — never `null`, which Payload turns into a closed
 * panel plus a persisted "don't show live preview" preference.
 */
describe('livePreviewUnavailableUrl', () => {
  it('is absolute, so the panel iframe can load it', () => {
    expect(livePreviewUnavailableUrl('no-path')).toMatch(/^https?:\/\//)
  })

  it('names the reason, so the page can explain the specific problem', () => {
    expect(livePreviewUnavailableUrl('no-region')).toContain('reason=no-region')
    expect(livePreviewUnavailableUrl('no-key')).toContain('reason=no-key')
  })

  it('points at this service, so the CSP frame-src `self` already allows it', () => {
    const url = new URL(livePreviewUnavailableUrl('no-path'))
    expect(url.pathname).toBe('/live-preview-unavailable')
  })
})
