/**
 * @vitest-environment jsdom
 *
 * `PreviewTarget` against a stand-in for Payload's live-preview provider
 * (#708). `composeTargetUrl` is pinned separately; what needs a DOM is the
 * part that exists only across mounts — which URL the panel goes back to.
 *
 * The stand-in reproduces the two provider behaviours the component is built
 * around, both read from `@payloadcms/ui/dist/providers/LivePreview/index.js`:
 * `setURL` ignores an identical URL, and a falsy one closes the panel.
 *
 * The case worth the file is the **tab switch**. React mounts the incoming
 * tab's field with the URL from the render it mounted in — still the outgoing
 * tab's composed URL, because the outgoing restore has not re-rendered the
 * provider yet. A per-instance "remember the first URL I saw" therefore
 * records a composed URL as the default and, on the way out, sends the panel
 * to a view nobody asked for. No single-mount test can see it, and this is the
 * spec that caught it.
 */
import type { UIFieldClientComponent } from 'payload'
import type { ReactNode } from 'react'

import { act, createContext, createElement, useCallback, useContext, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PreviewTarget as PreviewTargetDeclaration } from '@/fields/previewTargetField'

interface LivePreviewStub {
  isLivePreviewEnabled: boolean
  setIsLivePreviewing: (value: boolean) => void
  setURL: (url: string) => void
  url: string
}

const stub = vi.hoisted(() => ({ useStubbedContext: (() => ({})) as () => unknown }))
vi.mock('@payloadcms/ui', () => ({
  useLivePreviewContext: () => stub.useStubbedContext(),
}))

const LivePreviewStubContext = createContext<LivePreviewStub | null>(null)
stub.useStubbedContext = function useStubbedContext() {
  return useContext(LivePreviewStubContext)
}

const DEFAULT_URL = 'https://atlas.example/preview?secret=s3cret&locale=fr'

/** What the panel is showing, and whether it is open. */
const panel = { open: false, url: DEFAULT_URL }

/** Payload's provider, reduced to the two behaviours the component relies on. */
function Provider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState(DEFAULT_URL)

  const setURL = useCallback((next: string) => {
    if (!next) {
      panel.open = false
      return
    }
    setUrl((current) => (current === next ? current : next))
  }, [])

  const setIsLivePreviewing = useCallback((value: boolean) => {
    panel.open = value
  }, [])

  useEffect(() => {
    panel.url = url
  }, [url])

  return createElement(
    LivePreviewStubContext.Provider,
    { value: { isLivePreviewEnabled: true, setIsLivePreviewing, setURL, url } },
    children,
  )
}

const field = (previewTarget?: PreviewTargetDeclaration, name = 'tab__preview_target') => ({
  name,
  type: 'ui' as const,
  admin: previewTarget ? { custom: { previewTarget } } : {},
})

describe('PreviewTarget', () => {
  let PreviewTarget: UIFieldClientComponent
  let root: Root

  beforeEach(async () => {
    // The component keeps the panel's default and last composed URL in module
    // state — one panel per document view — so each case needs a fresh module.
    vi.resetModules()
    PreviewTarget = (await import('@/components/admin/PreviewTarget/PreviewTarget')).PreviewTarget

    panel.open = false
    panel.url = DEFAULT_URL

    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  /**
   * Renders one tab's field, or none. The key is the field's own name, so
   * switching tabs unmounts one instance and mounts another in a single commit
   * — the shape under test. Reusing one key would let React update the
   * existing instance instead, and no handoff would happen at all.
   */
  const openTab = (target: PreviewTargetDeclaration | null, name = 'tab__preview_target') => {
    act(() => {
      root.render(
        createElement(
          Provider,
          null,
          target === null
            ? null
            : createElement(PreviewTarget as never, { key: name, field: field(target, name) }),
        ),
      )
    })
  }

  it('repoints the panel at the tab’s view, keeping origin and secret', () => {
    openTab({ path: '/search' })

    expect(panel.url).toBe('https://atlas.example/search?secret=s3cret&locale=fr')
  })

  it('restores the default when the tab closes, and never closes the panel', () => {
    openTab({ path: '/search' })
    openTab(null)

    expect(panel.url).toBe(DEFAULT_URL)
    expect(panel.open).toBe(false)
  })

  it('restores the default — not the previous tab’s view — after a tab switch', () => {
    openTab({ path: '/search' }, 'search__preview_target')
    openTab({ path: '/calendar' }, 'calendar__preview_target')

    expect(panel.url).toBe('https://atlas.example/calendar?secret=s3cret&locale=fr')

    openTab(null)

    expect(panel.url).toBe(DEFAULT_URL)
  })

  it('opens the panel and leaves its URL alone for an autoOpen-only tab', () => {
    openTab({ autoOpen: true })

    expect(panel.url).toBe(DEFAULT_URL)
    expect(panel.open).toBe(true)

    openTab(null)

    expect(panel.url).toBe(DEFAULT_URL)
  })

  it('leaves the panel alone for a target that would change the origin', () => {
    openTab({ path: 'https://evil.example/x' })

    expect(panel.url).toBe(DEFAULT_URL)
  })

  it('does nothing for a field carrying no declaration', () => {
    act(() => {
      root.render(
        createElement(
          Provider,
          null,
          createElement(PreviewTarget as never, { key: 'bare', field: field() }),
        ),
      )
    })

    expect(panel.url).toBe(DEFAULT_URL)
    expect(panel.open).toBe(false)
  })
})
