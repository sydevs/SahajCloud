import { describe, expect, it } from 'vitest'

import { livePreviewUnavailableUrl } from '@/lib/livePreview/unavailable'

/**
 * The panel's fallback URL. Its one job is to be a real, same-origin URL that
 * renders an explanation — never `null`, which Payload turns into a closed
 * panel plus a persisted "don't show live preview" preference.
 */
describe('livePreviewUnavailableUrl', () => {
  it('is root-relative, so it is same-origin wherever the admin is served', () => {
    // The old assertion only checked it looked like a URL, which an absolute
    // `http://localhost:3000/...` satisfied — and that is exactly the value a
    // Railway PR preview produced, cross-origin and refused by the CSP.
    expect(livePreviewUnavailableUrl('no-path')).toMatch(/^\/live-preview-unavailable\?/)
    expect(livePreviewUnavailableUrl('no-path')).not.toMatch(/^https?:\/\//)
  })

  it('names the reason, so the page can explain the specific problem', () => {
    expect(livePreviewUnavailableUrl('no-region')).toContain('reason=no-region')
    expect(livePreviewUnavailableUrl('no-key')).toContain('reason=no-key')
  })

  it('resolves to this service against any admin origin', () => {
    for (const origin of ['https://cloud.sydevelopers.com', 'https://pr-42.up.railway.app']) {
      const url = new URL(livePreviewUnavailableUrl('no-path'), origin)
      expect(url.origin).toBe(origin)
      expect(url.pathname).toBe('/live-preview-unavailable')
    }
  })
})
