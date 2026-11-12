/**
 * @vitest-environment jsdom
 *
 * The note under an Atlas-tab colour picker: what the atlas preview reports it
 * rendered (`sahaj-atlas:palette-report`, sydevs/SahajAtlasWeb#392).
 *
 * `readAdjustment` is the contract. The component tests pin the two things a
 * listener gets wrong: hearing a sender other than the preview frame, and
 * missing the frame because the panel opened after the field mounted.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PALETTE_REPORT_MESSAGE, readAdjustment } from '@/components/admin/ColorField/paletteReport'

const stub = vi.hoisted(() => ({
  iframeRef: { current: null as HTMLIFrameElement | null },
  setValue: vi.fn(),
  value: '#ffff00' as string,
}))

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    createElement('button', { onClick, type: 'button' }, children),
  FieldDescription: () => null,
  FieldError: () => null,
  FieldLabel: () => null,
  useField: () => ({ setValue: stub.setValue, showError: false, value: stub.value }),
  useLivePreviewContext: () => ({ iframeRef: stub.iframeRef }),
}))

const { ColorField } = await import('@/components/admin/ColorField/ColorField')

const ATLAS = 'http://localhost:5173'

const report = (primary: Record<string, unknown>) => ({
  roles: { primary },
  type: PALETTE_REPORT_MESSAGE,
})

const ADJUSTED = {
  adjustedBy: ['surface'],
  dark: '#ffff33',
  entered: '#ffff00',
  light: '#757500',
  suggested: '#757500',
}

describe('readAdjustment', () => {
  it('reads the rendered colour, the reason and the suggestion for its own field', () => {
    expect(readAdjustment(report(ADJUSTED), 'color1', '#FFFF00')).toEqual({
      light: '#757500',
      reasons: ['darkened to stand out on white'],
      suggested: '#757500',
    })
  })

  it('shows nothing for an unadjusted role, another field, or another message', () => {
    expect(readAdjustment(report({ ...ADJUSTED, adjustedBy: [] }), 'color1', '#ffff00')).toBeNull()
    expect(readAdjustment(report(ADJUSTED), 'color2', '#ffff00')).toBeNull()
    expect(readAdjustment(report(ADJUSTED), 'title', '#ffff00')).toBeNull()
    expect(readAdjustment({ ...report(ADJUSTED), type: 'other' }, 'color1', '#ffff00')).toBeNull()
    expect(readAdjustment(null, 'color1', '#ffff00')).toBeNull()
  })

  it('ignores a report about a colour the field no longer holds', () => {
    expect(readAdjustment(report(ADJUSTED), 'color1', '#123456')).toBeNull()
  })

  it('offers no suggestion where the widget has none to give', () => {
    const textOnly = { ...ADJUSTED, adjustedBy: ['panel-text'], suggested: null }

    expect(readAdjustment(report(textOnly), 'color1', '#ffff00')).toEqual({
      light: '#757500',
      reasons: ['adjusted so text stays readable'],
      suggested: null,
    })
  })

  it('still shows the note for a check it has no sentence for', () => {
    const future = { ...ADJUSTED, adjustedBy: ['something-new'] }

    expect(readAdjustment(report(future), 'color1', '#ffff00')?.reasons).toEqual([])
  })
})

describe('ColorField', () => {
  let container: HTMLDivElement
  let root: Root

  const field = { admin: {}, label: 'Primary', name: 'color1', type: 'text' }

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

  beforeEach(async () => {
    stub.iframeRef.current = null
    stub.setValue.mockReset()
    stub.value = '#ffff00'
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(ColorField as never, { field, path: 'color1' }))
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
  })

  it('hears a preview opened after the field mounted, and applies the suggestion', async () => {
    const frame = openPreview()

    await post(report(ADJUSTED), frame.contentWindow)

    expect(container.textContent).toContain('Visitors see #757500 — darkened to stand out on white')

    act(() => container.querySelector('button')!.click())

    expect(stub.setValue).toHaveBeenCalledWith('#757500')
  })

  it('ignores the same report from any window but the preview frame', async () => {
    openPreview()

    await post(report(ADJUSTED), window)

    expect(container.textContent).not.toContain('Visitors see')
  })

  it('ignores the preview frame once it has navigated to another origin', async () => {
    const frame = openPreview()

    await post(report(ADJUSTED), frame.contentWindow, 'https://elsewhere.example')

    expect(container.textContent).not.toContain('Visitors see')
  })
})
