import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { livePreviewUnavailableUrl } from '@/lib/livePreview/unavailable'

/** The literals of one half of the reason vocabulary, read from its source. */
const reasonsOf = (name: string): string[] => {
  const source = readFileSync('src/lib/livePreview/unavailable.ts', 'utf8')
  const union = source.match(new RegExp(`export type ${name} =([^]*?)\\n\\n`))
  return [...(union?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map((match) => match[1]!)
}

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

  it('has a written explanation for every reason, not the generic fallback', () => {
    // The page falls back to a generic message for an unknown reason, which is
    // the right way round for a panel and would hide a reason nobody wrote an
    // entry for. Both halves are types, so only reading both sources can
    // compare them.
    const explained = readFileSync('src/app/(frontend)/live-preview-unavailable/page.tsx', 'utf8')
    const declared = [...reasonsOf('ServerResolvedReason'), ...reasonsOf('PanelComposedReason')]

    expect(declared).toContain('atlas-tab-only')
    expect(declared).toContain('no-atlas-role')
    for (const reason of declared) expect(explained).toContain(`'${reason}':`)
  })

  it('resolves each reason on one side only, so a composed URL stays ours', () => {
    // `helpers/panelUrl` tells a URL a component composed from one the server
    // resolved by comparing the text. A reason on both sides makes the two
    // byte-identical, and the panel's recorded default then stays the previous
    // document's — which is how a tab's repoint reaches another origin.
    const server = reasonsOf('ServerResolvedReason')
    const composed = reasonsOf('PanelComposedReason')

    expect(server.length).toBeGreaterThan(0)
    expect(composed.length).toBeGreaterThan(0)
    expect(server.filter((reason) => composed.includes(reason))).toEqual([])
  })

  it('resolves to this service against any admin origin', () => {
    for (const origin of ['https://cloud.sydevelopers.com', 'https://pr-42.up.railway.app']) {
      const url = new URL(livePreviewUnavailableUrl('no-path'), origin)
      expect(url.origin).toBe(origin)
      expect(url.pathname).toBe('/live-preview-unavailable')
    }
  })
})
