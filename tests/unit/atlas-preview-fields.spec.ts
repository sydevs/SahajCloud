/**
 * @vitest-environment jsdom
 *
 * The Atlas tab's preview fields: what the atlas reports it rendered
 * (`sahaj-atlas:palette-report`, sydevs/SahajAtlasWeb#392), the banner that shows
 * it, and the light/dark mode sent back.
 *
 * `readSwatch` is the contract. The component tests pin what a listener gets
 * wrong — hearing a sender other than the preview frame, or a mode dropped by an
 * atlas that starts listening after its `load` — and the one action over all three.
 *
 * The stand-in reproduces only what the components read: `useField` per path,
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
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode
    disabled?: boolean
    onClick: () => void
  }) => createElement('button', { disabled, onClick, type: 'button' }, children),
  FieldLabel: ({ label }: { label: string }) => createElement('label', null, label),
  useField: ({ path }: { path: string }) => stub.fields[path],
  useLivePreviewContext: () => ({ iframeRef: stub.iframeRef, url: 'x' }),
}))

const { AdjustedColors } = await import('@/components/admin/AtlasPreview/AdjustedColors')
const { MapPreviewField } = await import('@/components/admin/AtlasPreview/MapPreviewField')

const ATLAS = 'http://localhost:5173'

const PRIMARY = {
  dark: '#fefdfb',
  darkAdjustedBy: ['panel-text'],
  lightAdjustedBy: ['surface', 'panel-text'],
  entered: '#ffff00',
  light: '#979726',
  suggested: '#979726',
}

const ACCENT = {
  darkAdjustedBy: ['panel-text'],
  lightAdjustedBy: ['panel-text'],
  dark: '#ffaa33',
  entered: '#ff9900',
  light: '#c27a14',
  suggested: null,
}

const report = (roles: Record<string, unknown>) => ({ roles, type: PALETTE_REPORT_MESSAGE })

describe('readSwatch', () => {
  it('reads both modes, the reason and the suggestion', () => {
    expect(readSwatch(report({ primary: PRIMARY }), 'color1', '#FFFF00')).toEqual({
      adjusted: true,
      dark: '#FEFDFB',
      darkAdjusted: false,
      lightAdjusted: true,
      light: '#979726',
      reasons: ['adjusted for contrast with the background'],
      suggested: '#979726',
    })
  })

  it('reads a swatch the widget left alone — panel text is not the swatch', () => {
    expect(readSwatch(report({ contrast: ACCENT }), 'color3', '#ff9900')).toEqual({
      adjusted: false,
      dark: '#FFAA33',
      darkAdjusted: false,
      lightAdjusted: false,
      light: '#C27A14',
      reasons: [],
      suggested: null,
    })
  })

  it('shows an unset colour as the Atlas default, never adjusted', () => {
    expect(readSwatch(report({}), 'color2', null)).toMatchObject({
      adjusted: false,
      dark: '#5E98BA',
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
    const future = { ...PRIMARY, lightAdjustedBy: ['something-new'] }

    expect(readSwatch(report({ primary: future }), 'color1', '#ffff00')).toMatchObject({
      adjusted: true,
      reasons: [],
    })
  })
})

let container: HTMLDivElement
let root: Root

const openPreview = () => {
  const frame = document.createElement('iframe')

  frame.src = `${ATLAS}/?live-preview=x`
  document.body.appendChild(frame)
  stub.iframeRef.current = frame

  return frame
}

const mount = (component: unknown) =>
  act(async () => {
    root.render(createElement(component as never, {}))
  })

const post = (data: unknown, source: Window | null, origin = ATLAS) =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }))
  })

const banner = () => container.querySelector('.atlas-preview__banner')
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

describe('AdjustedColors', () => {
  it('shows every colour in both modes once one is adjusted, marking each and saying why', async () => {
    await mount(AdjustedColors)
    const frame = openPreview()

    await post(report({ contrast: ACCENT, primary: PRIMARY }), frame.contentWindow)

    expect(banner()?.textContent).toContain('Colors are being adjusted for visibility')
    expect(
      [...container.querySelectorAll('.atlas-preview__swatch')].map((swatch) =>
        swatch.getAttribute('title'),
      ),
    ).toEqual(['#979726', '#FEFDFB', '#5E98BA', '#5E98BA', '#C27A14', '#FFAA33'])
    expect(
      [...container.querySelectorAll('.atlas-preview__mark')].map((mark) => mark.textContent),
    ).toEqual(['!', '✓', '✓', '✓', '✓', '✓'])
    expect([...container.querySelectorAll('td:last-child')].map((td) => td.textContent)).toEqual([
      'Primary — adjusted for contrast with the background.',
      'Secondary — This color is safe to use.',
      'Accent — This color is safe to use.',
    ])
  })

  it('joins several reasons with semicolons', async () => {
    await mount(AdjustedColors)
    const frame = openPreview()
    const primary = { ...PRIMARY, lightAdjustedBy: ['selected-distinct', 'surface'] }

    await post(report({ contrast: ACCENT, primary }), frame.contentWindow)

    expect(container.querySelector('td:last-child')?.textContent).toBe(
      'Primary — shifted to stand out from Primary; adjusted for contrast with the background.',
    )
  })

  it('keeps the last answer up while the next report is on its way', async () => {
    await mount(AdjustedColors)
    const frame = openPreview()

    await post(report({ contrast: ACCENT, primary: PRIMARY }), frame.contentWindow)

    // A pick the atlas has not reported on yet: hiding the banner for that round
    // trip is what made it flicker.
    stub.fields.color1.value = '#123456'
    await mount(AdjustedColors)

    expect(banner()).not.toBeNull()
    expect(button('Use adjusted colors')?.disabled).toBe(true)
  })

  it('shows nothing while nothing is adjusted', async () => {
    await mount(AdjustedColors)
    const frame = openPreview()

    await post(
      report({
        contrast: ACCENT,
        primary: { ...PRIMARY, darkAdjustedBy: [], lightAdjustedBy: [] },
      }),
      frame.contentWindow,
    )

    expect(banner()).toBeNull()
  })

  it('applies every suggestion at once, and skips a colour with none', async () => {
    await mount(AdjustedColors)
    const frame = openPreview()
    const accent = { ...ACCENT, lightAdjustedBy: ['selected-distinct'] }

    await post(report({ contrast: accent, primary: PRIMARY }), frame.contentWindow)
    act(() => button('Use adjusted colors')!.click())

    expect(stub.fields.color1.setValue).toHaveBeenCalledWith('#979726')
    expect(stub.fields.color3.setValue).not.toHaveBeenCalled()
  })

  it('ignores the same report from any window but the preview frame', async () => {
    await mount(AdjustedColors)
    openPreview()

    await post(report({ contrast: ACCENT, primary: PRIMARY }), window)

    expect(banner()).toBeNull()
  })

  it('ignores the preview frame once it has navigated to another origin', async () => {
    await mount(AdjustedColors)
    const frame = openPreview()

    await post(
      report({ contrast: ACCENT, primary: PRIMARY }),
      frame.contentWindow,
      'https://elsewhere.example',
    )

    expect(banner()).toBeNull()
  })
})

describe('MapPreviewField', () => {
  it("re-sends the mode on the atlas's first message, and only its first", async () => {
    const frame = openPreview()
    const sent = vi.spyOn(frame.contentWindow!, 'postMessage')

    await mount(MapPreviewField)
    sent.mockClear()

    await post(report({}), frame.contentWindow)
    await post(report({}), frame.contentWindow)

    expect(sent).toHaveBeenCalledTimes(1)
    expect(sent).toHaveBeenCalledWith({ mode: 'light', type: 'sahaj-atlas:preview-mode' }, ATLAS)
  })
})
