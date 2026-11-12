/**
 * @vitest-environment jsdom
 *
 * The controls under the Atlas tab's colour pickers, and what the atlas preview
 * reports it rendered (`sahaj-atlas:palette-report`, sydevs/SahajAtlasWeb#392).
 *
 * `readSwatch` is the contract. The component tests pin what a listener
 * gets wrong — hearing a sender other than the preview frame, or missing a frame
 * that opened after the field mounted — the one action over all three, and the
 * light/dark mode reaching an atlas that starts listening after its `load`.
 *
 * The stand-in reproduces only what the component reads: `useField` per path,
 * `useLivePreviewContext().iframeRef`, and a `Banner` that renders its children.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PALETTE_REPORT_MESSAGE, readSwatch } from '@/components/admin/AtlasPreview/paletteReport'

const stub = vi.hoisted(() => ({
  fields: {} as Record<string, { setValue: (value: unknown) => void; value: null | string }>,
  iframeRef: { current: null as HTMLIFrameElement | null },
}))

vi.mock('@payloadcms/ui', () => ({
  Banner: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    createElement('div', { className }, children),
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    createElement('button', { onClick, type: 'button' }, children),
  useField: ({ path }: { path: string }) => stub.fields[path],
  useLivePreviewContext: () => ({ iframeRef: stub.iframeRef, url: 'x' }),
}))

const { ColorControls } = await import('@/components/admin/AtlasPreview/ColorControls')

const ATLAS = 'http://localhost:5173'

const PRIMARY = {
  adjustedBy: ['surface', 'panel-text'],
  dark: '#ffff33',
  entered: '#ffff00',
  light: '#979726',
  suggested: '#979726',
}

const ACCENT = {
  adjustedBy: ['panel-text'],
  dark: '#ffaa33',
  entered: '#ff9900',
  light: '#c27a14',
  suggested: null,
}

const report = (roles: Record<string, unknown>) => ({ roles, type: PALETTE_REPORT_MESSAGE })

describe('readSwatch', () => {
  it('reads the rendered colour, the reason and the suggestion', () => {
    expect(readSwatch(report({ primary: PRIMARY }), 'color1', '#FFFF00')).toEqual({
      adjusted: true,
      light: '#979726',
      reasons: ['darkened for contrast on white'],
      suggested: '#979726',
    })
  })

  it('reads a swatch the widget left alone — panel text is not the swatch', () => {
    expect(readSwatch(report({ contrast: ACCENT }), 'color3', '#ff9900')).toEqual({
      adjusted: false,
      light: '#C27A14',
      reasons: [],
      suggested: null,
    })
  })

  it('shows an unset colour as the Atlas default, never adjusted', () => {
    expect(readSwatch(report({}), 'color2', null)).toMatchObject({
      adjusted: false,
      light: '#5E98BA',
    })
  })

  it('reads only its own role, and only a palette report', () => {
    expect(readSwatch(report({ primary: PRIMARY }), 'color3', '#ffff00')).toBeNull()
    expect(
      readSwatch({ ...report({ primary: PRIMARY }), type: 'other' }, 'color1', '#ffff00'),
    ).toBeNull()
    expect(readSwatch(null, 'color1', '#ffff00')).toBeNull()
  })

  it('ignores a report about a colour the field no longer holds', () => {
    expect(readSwatch(report({ primary: PRIMARY }), 'color1', '#123456')).toBeNull()
  })

  it('still counts a check it has no words for', () => {
    const future = { ...PRIMARY, adjustedBy: ['something-new'] }

    expect(readSwatch(report({ primary: future }), 'color1', '#ffff00')).toMatchObject({
      adjusted: true,
      reasons: [],
    })
  })
})

describe('ColorControls', () => {
  let container: HTMLDivElement
  let root: Root

  const openPreview = () => {
    const frame = document.createElement('iframe')

    frame.src = `${ATLAS}/?live-preview=x`
    document.body.appendChild(frame)
    stub.iframeRef.current = frame

    return frame
  }

  const mount = () =>
    act(async () => {
      root.render(createElement(ColorControls as never, {}))
    })

  const post = (data: unknown, source: Window | null, origin = ATLAS) =>
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data, origin, source }))
    })

  const summary = () => container.querySelector('.color-controls__banner')
  const button = (name: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent === name)

  beforeEach(() => {
    stub.iframeRef.current = null
    stub.fields = Object.fromEntries(
      ['color1', 'color2', 'color3'].map((path) => [path, { setValue: vi.fn(), value: null }]),
    )
    stub.fields.color1.value = '#ffff00'
    stub.fields.color3.value = '#ff9900'
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
  })

  it('shows all three colours once one is adjusted, marking it and listing why', async () => {
    await mount()
    const frame = openPreview()

    await post(report({ contrast: ACCENT, primary: PRIMARY }), frame.contentWindow)

    expect(summary()?.textContent).toContain('Colors are being adjusted for visibility')
    expect(container.querySelectorAll('.color-controls__swatch')).toHaveLength(3)
    expect(container.querySelectorAll('.color-controls__mark')).toHaveLength(1)
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Primary #979726 — darkened for contrast on white',
    ])
  })

  it('shows no summary while nothing is adjusted', async () => {
    await mount()
    const frame = openPreview()

    await post(
      report({ contrast: ACCENT, primary: { ...PRIMARY, adjustedBy: [] } }),
      frame.contentWindow,
    )

    expect(summary()).toBeNull()
    expect(button('Use adjusted colors')).toBeUndefined()
  })

  it('applies every suggestion at once, and skips a colour with none', async () => {
    await mount()
    const frame = openPreview()
    const accent = { ...ACCENT, adjustedBy: ['selected-distinct'] }

    await post(report({ contrast: accent, primary: PRIMARY }), frame.contentWindow)
    act(() => button('Use adjusted colors')!.click())

    expect(stub.fields.color1.setValue).toHaveBeenCalledWith('#979726')
    expect(stub.fields.color3.setValue).not.toHaveBeenCalled()
  })

  it('ignores the same report from any window but the preview frame', async () => {
    await mount()
    openPreview()

    await post(report({ contrast: ACCENT, primary: PRIMARY }), window)

    expect(summary()).toBeNull()
  })

  it('ignores the preview frame once it has navigated to another origin', async () => {
    await mount()
    const frame = openPreview()

    await post(
      report({ contrast: ACCENT, primary: PRIMARY }),
      frame.contentWindow,
      'https://elsewhere.example',
    )

    expect(summary()).toBeNull()
  })

  it("re-sends the mode on the atlas's first message, and only its first", async () => {
    const frame = openPreview()
    const sent = vi.spyOn(frame.contentWindow!, 'postMessage')

    await mount()
    sent.mockClear()

    await post(report({}), frame.contentWindow)
    await post(report({}), frame.contentWindow)

    expect(sent).toHaveBeenCalledTimes(1)
    expect(sent).toHaveBeenCalledWith({ mode: 'light', type: 'sahaj-atlas:preview-mode' }, ATLAS)
  })
})
