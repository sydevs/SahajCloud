/**
 * @vitest-environment jsdom
 *
 * `EmailPreviewField` and the one thing that lives between mounts: whether a
 * request is spent at all. Each render is a full server-side template render
 * of the real email, and the collapsible holding it starts closed — so an
 * effect that runs on mount bills every Atlas-tab visit for a sample nobody
 * opened.
 *
 * The stand-in reproduces only what the component reads: `Collapsible`'s
 * `onToggle`, the document id, and the four form values the template draws.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stub = vi.hoisted(() => ({
  fields: {
    color1: { value: '#1E6C71' },
    color2: { value: '#5e98ba' },
    logo: { value: 7 },
    title: { value: 'Pune' },
  } as Record<string, { value: unknown }>,
  id: 42 as null | number,
}))

vi.mock('@payloadcms/ui', () => ({
  Collapsible: ({
    children,
    onToggle,
  }: {
    children: React.ReactNode
    onToggle?: (collapsed: boolean) => void
  }) =>
    createElement('div', null, [
      createElement(
        'button',
        { key: 'toggle', onClick: () => onToggle?.(false), type: 'button' },
        'open',
      ),
      createElement('div', { key: 'body' }, children),
    ]),
  useDocumentInfo: () => ({ id: stub.id }),
  useFormFields: (selector: (state: [Record<string, { value: unknown }>]) => unknown) =>
    selector([stub.fields]),
}))

let container: HTMLDivElement
let fetchMock: ReturnType<typeof vi.fn>
let root: Root

beforeEach(async () => {
  vi.useFakeTimers()
  stub.id = 42
  fetchMock = vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve({ html: '<p>sample</p>' }), ok: true }),
  )
  vi.stubGlobal('fetch', fetchMock)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const { EmailPreviewField } = await import('@/components/admin/AtlasPreview/EmailPreviewField')
  await act(async () => {
    root.render(createElement(EmailPreviewField, {} as never))
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Past the 500 ms settle, with the fetch's own microtasks drained. */
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
}

describe('EmailPreviewField', () => {
  it('spends no render while the collapsible is closed', async () => {
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders once it is opened', async () => {
    await act(async () => {
      container.querySelector('button')?.click()
    })
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/clients/42/email-preview')
    expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe('<p>sample</p>')
  })
})
