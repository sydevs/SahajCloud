/**
 * @vitest-environment jsdom
 *
 * The controls under the Atlas tab's colour pickers, and what the atlas preview
 * reports it rendered (`sahaj-atlas:palette-report`, sydevs/SahajAtlasWeb#392).
 *
 * `readAdjustment` is the contract. The component tests pin what a listener
 * gets wrong — hearing a sender other than the preview frame, or missing a frame
 * that opened after the field mounted — and the one action over all three.
 *
 * The stand-in reproduces only what the component reads: `useField` per path,
 * `useLivePreviewContext().iframeRef`, and a `Tooltip` that renders while shown.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PALETTE_REPORT_MESSAGE,
  readAdjustment,
} from '@/components/admin/AtlasPreview/paletteReport'

const stub = vi.hoisted(() => ({
  fields: {} as Record<string, { setValue: (value: unknown) => void; value: null | string }>,
  iframeRef: { current: null as HTMLIFrameElement | null },
}))

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    createElement('button', { onClick, type: 'button' }, children),
  Tooltip: ({ children, show }: { children: React.ReactNode; show?: boolean }) =>
    show ? createElement('div', { role: 'tooltip' }, children) : null,
  useField: ({ path }: { path: string }) => stub.fields[path],
  useLivePreviewContext: () => ({ iframeRef: stub.iframeRef, url: 'x' }),
}))

const { ColorControls } = await import('@/components/admin/AtlasPreview/ColorControls')

const ATLAS = 'http://localhost:5173'

const ADJUSTED = {
  adjustedBy: ['surface', 'panel-text'],
  dark: '#ffff33',
  entered: '#ffff00',
  light: '#979726',
  suggested: '#979726',
}

const report = (roles: Record<string, unknown>) => ({ roles, type: PALETTE_REPORT_MESSAGE })

describe('readAdjustment', () => {
  it('reads the rendered colour, the reason and the suggestion', () => {
    expect(readAdjustment(report({ primary: ADJUSTED }), 'color1', '#FFFF00')).toEqual({
      light: '#979726',
      reasons: ['darkened for contrast on white'],
      suggested: '#979726',
    })
  })

  it('shows nothing where the swatch looks as entered — panel text is not the swatch', () => {
    const textOnly = { ...ADJUSTED, adjustedBy: ['panel-text'], suggested: null }

    expect(readAdjustment(report({ primary: textOnly }), 'color1', '#ffff00')).toBeNull()
    expect(
      readAdjustment(report({ primary: { ...ADJUSTED, adjustedBy: [] } }), 'color1', '#ffff00'),
    ).toBeNull()
  })

  it('reads only its own role, and only a palette report', () => {
    expect(readAdjustment(report({ primary: ADJUSTED }), 'color2', '#ffff00')).toBeNull()
    expect(
      readAdjustment({ ...report({ primary: ADJUSTED }), type: 'other' }, 'color1', '#ffff00'),
    ).toBeNull()
    expect(readAdjustment(null, 'color1', '#ffff00')).toBeNull()
  })

  it('ignores a report about a colour the field no longer holds', () => {
    expect(readAdjustment(report({ primary: ADJUSTED }), 'color1', '#123456')).toBeNull()
  })

  it('still counts a check it has no words for', () => {
    const future = { ...ADJUSTED, adjustedBy: ['something-new'] }

    expect(readAdjustment(report({ primary: future }), 'color1', '#ffff00')?.reasons).toEqual([])
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

  const post = (data: unknown, source: Window | null, origin = ATLAS) =>
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data, origin, source }))
    })

  const summary = () => container.querySelector('.color-controls__summary')
  const button = (name: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent === name)

  beforeEach(async () => {
    stub.iframeRef.current = null
    stub.fields = Object.fromEntries(
      ['color1', 'color2', 'color3'].map((path) => [path, { setValue: vi.fn(), value: null }]),
    )
    stub.fields.color1.value = '#ffff00'
    stub.fields.color3.value = '#ff9900'
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(ColorControls as never, {}))
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
  })

  it('summarises every adjusted colour in one line, with all reasons in one tooltip', async () => {
    const frame = openPreview()
    const accent = {
      ...ADJUSTED,
      adjustedBy: ['surface', 'selected-distinct'],
      entered: '#ff9900',
      light: '#9b6d27',
      suggested: null,
    }

    await post(report({ contrast: accent, primary: ADJUSTED }), frame.contentWindow)

    expect(summary()?.textContent).toContain('Visitors see adjusted colors')
    expect(container.querySelectorAll('.color-controls__swatch')).toHaveLength(2)

    act(() => summary()!.dispatchEvent(new FocusEvent('focusin', { bubbles: true })))

    const tooltip = container.querySelector('[role="tooltip"]')?.textContent

    expect(tooltip).toContain('Primary #979726 — darkened for contrast on white')
    expect(tooltip).toContain(
      'Accent #9B6D27 — darkened for contrast on white and shifted to stand out from Primary',
    )
  })

  it('applies every suggestion at once, and skips a colour with none', async () => {
    const frame = openPreview()
    const accent = { ...ADJUSTED, entered: '#ff9900', suggested: null }

    await post(report({ contrast: accent, primary: ADJUSTED }), frame.contentWindow)
    act(() => button('Use adjusted colors')!.click())

    expect(stub.fields.color1.setValue).toHaveBeenCalledWith('#979726')
    expect(stub.fields.color3.setValue).not.toHaveBeenCalled()
  })

  it('offers no action and no summary before the preview reports', () => {
    expect(summary()).toBeNull()
    expect(button('Use adjusted colors')).toBeUndefined()
    expect(button('Reset colors')).toBeDefined()
  })

  it('ignores the same report from any window but the preview frame', async () => {
    openPreview()

    await post(report({ primary: ADJUSTED }), window)

    expect(summary()).toBeNull()
  })

  it('ignores the preview frame once it has navigated to another origin', async () => {
    const frame = openPreview()

    await post(report({ primary: ADJUSTED }), frame.contentWindow, 'https://elsewhere.example')

    expect(summary()).toBeNull()
  })
})
