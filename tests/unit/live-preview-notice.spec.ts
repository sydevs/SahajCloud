/**
 * @vitest-environment jsdom
 *
 * The watcher that points a silent live-preview panel at the explanation page
 * (#1204), and the scope rule deciding which panels it watches at all.
 *
 * The stand-in reproduces the three things the component reads off Payload's
 * live-preview provider: `appIsReady`, which the provider sets from the
 * consumer's `payload-live-preview` handshake; `setURL`, its middleware over
 * the panel address; and `setAppIsReady`, which both the provider and this
 * component clear when the address changes
 * (`@payloadcms/ui/dist/providers/LivePreview/index.js`).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PREVIEW_SCOPES, panelUrlSubscribes } from '@/lib/livePreview/scope'

const ATLAS = 'https://atlas.example/preview'

const stub = vi.hoisted(() => ({
  iframeRef: { current: null as HTMLIFrameElement | null },
  ready: false,
  open: true,
  windowType: 'iframe',
  url: '',
}))

// ⚠ Both setters are stable, as the provider's own are: `setAppIsReady` is a
// `useState` setter, and `setURL` a `useCallback`. A fresh identity per render
// would re-run the effects that depend on them and hide what they key on.
const setAppIsReady = (next: boolean) => {
  stub.ready = next
}
const setURL = (next: string) => {
  stub.url = next
}

vi.mock('@payloadcms/ui', () => ({
  useLivePreviewContext: () => ({
    appIsReady: stub.ready,
    iframeRef: stub.iframeRef,
    isLivePreviewing: stub.open,
    previewWindowType: stub.windowType,
    setAppIsReady,
    setURL,
    url: stub.url,
  }),
}))

const { LivePreviewNotice, PREVIEW_SILENCE_MS } =
  await import('@/components/admin/LivePreviewNotice')

let container: HTMLDivElement
let root: Root

/**
 * Renders, then renders again. Clearing the latch is a state update on the
 * provider, so the real panel re-renders under the component before its clock
 * reads `appIsReady` back. The stand-in holds plain values, so the second
 * render stands in for that one.
 */
const render = async () => {
  for (const _ of [0, 1]) {
    await act(async () => {
      root.render(createElement(LivePreviewNotice, {}))
    })
  }
}

/**
 * Only `setTimeout` is faked: `act` resolves through the microtask queue, which
 * a full fake clock takes over, and the render then never settles.
 */
const fakeClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => {
  stub.iframeRef.current = document.createElement('iframe')
  stub.ready = false
  stub.open = true
  stub.windowType = 'iframe'
  stub.url = ATLAS
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  stub.iframeRef.current = null
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('panelUrlSubscribes', () => {
  it('watches a document preview, which carries no scope', () => {
    expect(panelUrlSubscribes('https://wemeditate.example/about?live-preview=x')).toBe(true)
  })

  it('watches the Clients Atlas tab, whose consumer subscribes under its scope', () => {
    expect(panelUrlSubscribes(`${ATLAS}?scope=${PREVIEW_SCOPES.clients}&locale=en`)).toBe(true)
  })

  it('watches no scoped global — each consumer refuses the session it names', () => {
    // Derived, so a scope added to the vocabulary is answered for here too.
    const globals = Object.values(PREVIEW_SCOPES).filter((s) => s !== PREVIEW_SCOPES.clients)

    expect(globals.map((scope) => panelUrlSubscribes(`${ATLAS}?scope=${scope}`))).toEqual(
      globals.map(() => false),
    )
  })

  it('leaves a scope it does not know unwatched', () => {
    expect(panelUrlSubscribes(`${ATLAS}?scope=something-new`)).toBe(false)
  })
})

describe('LivePreviewNotice', () => {
  it('points the panel at the explanation page when the page never answers', async () => {
    fakeClock()
    await render()

    tick(PREVIEW_SILENCE_MS)

    expect(stub.url).toContain('/live-preview-unavailable?reason=preview-unreachable')
    expect(new URL(stub.url).origin).toBe(window.location.origin)
  })

  it('leaves the panel alone once the page has answered', async () => {
    fakeClock()
    await render()

    stub.ready = true
    await render()
    tick(PREVIEW_SILENCE_MS)

    expect(stub.url).toBe(ATLAS)
  })

  it('watches no scoped global, however long it stays silent', async () => {
    fakeClock()
    const scoped = `${ATLAS}?scope=${PREVIEW_SCOPES.atlasTranslations}`
    stub.url = scoped
    await render()

    tick(PREVIEW_SILENCE_MS)

    expect(stub.url).toBe(scoped)
  })

  it('watches no frame while the panel is closed', async () => {
    fakeClock()
    stub.open = false
    await render()

    tick(PREVIEW_SILENCE_MS)

    expect(stub.url).toBe(ATLAS)
  })

  it('watches no frame while the preview is a popup', async () => {
    // The remedy is to repoint the panel, and an explanation page opened in
    // someone's second window is not that.
    fakeClock()
    stub.windowType = 'popup'
    await render()

    tick(PREVIEW_SILENCE_MS)

    expect(stub.url).toBe(ATLAS)
  })

  it('never re-asks a frame that has already spoken', async () => {
    // Payload renders the iframe once and never unmounts it, so reopening the
    // panel brings back a frame that has already answered.
    fakeClock()
    await render()

    stub.ready = true
    await render()
    stub.open = false
    await render()
    stub.open = true
    await render()
    tick(PREVIEW_SILENCE_MS)

    expect(stub.url).toBe(ATLAS)
  })

  it('watches a new panel address, even though the old one had spoken', async () => {
    // A save re-resolves `livePreview.url` through the provider's raw state
    // setter, which does not clear the latch — so the component clears it, or a
    // frame that spoke once vouches for every later address.
    fakeClock()
    await render()

    stub.ready = true
    await render()
    stub.url = `${ATLAS}?region=2`
    await render()
    tick(PREVIEW_SILENCE_MS)

    expect(stub.url).toContain('/live-preview-unavailable?reason=preview-unreachable')
  })

  it('restarts the wait on each load, so a slow page is not called blocked', async () => {
    fakeClock()
    await render()

    tick(PREVIEW_SILENCE_MS - 1)
    act(() => void stub.iframeRef.current!.dispatchEvent(new Event('load')))
    tick(PREVIEW_SILENCE_MS - 1)

    expect(stub.url).toBe(ATLAS)
  })

  it('adds nothing to a panel that is already explaining itself', async () => {
    // The document's own refusal names the real problem; saying the preview is
    // blocked would name the wrong one.
    fakeClock()
    stub.url = `${window.location.origin}/live-preview-unavailable?reason=no-atlas-role`
    await render()

    tick(PREVIEW_SILENCE_MS)

    expect(stub.url).toContain('reason=no-atlas-role')
  })
})
