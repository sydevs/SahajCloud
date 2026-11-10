/**
 * @vitest-environment jsdom
 *
 * The intro-subtitles control's behaviour between renders, which no pure spec
 * can state: that it writes to form state and never to the server, that one
 * request is in flight at a time, and that a resolve the field has moved on
 * from is discarded rather than written into another language (#1016).
 *
 * The URL builders are pure and live in `tests/unit/admin-locale-urls.spec.ts`.
 *
 * **Mocked at the Payload boundary only** — `@payloadcms/ui` and
 * `lucide-react`. Four behaviours are reproduced, each read from the real
 * thing:
 *
 * - `useField({ path })` answers `{ value, initialValue, setValue }`; `value`
 *   is form state and `initialValue` is the saved document's, which is how the
 *   control tells an unsaved recording change from a saved one.
 * - `useFieldPath()` is the field's own path, which the control turns into its
 *   sibling upload field's.
 * - `useLocale().code` is the active admin locale, and its context default is
 *   `{}`, so the code can be `undefined` at runtime (#701).
 * - `useDocumentInfo().hasSavePermission` is what hides a control the server
 *   would only refuse.
 * - `Button` renders a `<button type="button">` — its own default, which is
 *   what keeps a click out of the document's save.
 *
 * Everything under test is therefore our own.
 */
import type { ReactNode } from 'react'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Subtitles } from '@/lib/utilities/subtitles'

const CUES: Subtitles = [
  { content: 'Close your eyes', startTimeMs: 100, endTimeMs: 1200 },
  { content: 'and take a breath', startTimeMs: 1200, endTimeMs: 3200 },
]

/** Cues a case can trace back to the run that produced them. */
const cuesFor = (fileId: number): Subtitles => [
  { content: `from file ${fileId}`, startTimeMs: 100, endTimeMs: 1200 },
]

/** What the stubs answer, reset per case. */
const stub = vi.hoisted(() => ({
  locale: 'en' as string | undefined,
  hasSavePermission: true,
  /** Form state and saved state for the sibling upload field. */
  audio: null as unknown,
  savedAudio: null as unknown,
  subtitles: null as unknown,
  setValue: vi.fn(),
  openModal: vi.fn(),
}))

vi.mock('@payloadcms/ui', () => ({
  // `icon` is a slot, not decoration: the running banner's spinner arrives
  // through it, so a mock dropping it would render a banner with no progress.
  Banner: ({ children, icon, type }: { children?: ReactNode; icon?: ReactNode; type?: string }) =>
    createElement('div', { 'data-banner': type ?? 'info' }, icon, children),
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children?: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) =>
    createElement('button', { 'data-button': 'true', disabled, onClick, type: 'button' }, children),
  ConfirmationModal: () => null,
  Spinner: () => createElement('div', { 'data-spinner': 'true' }),
  useDocumentInfo: () => ({ hasSavePermission: stub.hasSavePermission }),
  useField: ({ path }: { path: string }) =>
    path === 'introSubtitles'
      ? { setValue: stub.setValue, value: stub.subtitles }
      : { initialValue: stub.savedAudio, setValue: vi.fn(), value: stub.audio },
  useFieldPath: () => 'introSubtitles',
  useLocale: () => ({ code: stub.locale }),
  useModal: () => ({ openModal: stub.openModal }),
}))

vi.mock('lucide-react', () => ({
  Captions: () => null,
  Undo2: () => null,
}))

const fetchMock = vi.fn()

/** A method is case-insensitive to `fetch`, so the assertions are too. */
const isPost = (init: RequestInit | undefined): boolean => init?.method?.toLowerCase() === 'post'

/**
 * React needs this to run an **async** `act`, and only warns without it, so the
 * resolve the latch cases turn on would never be flushed. The sibling jsdom
 * specs are all synchronous and do not set it.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('the intro-subtitles control', () => {
  let IntroSubtitles: (props: { sourceField: string }) => ReactNode
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    fetchMock.mockClear()
    fetchMock.mockResolvedValue({ json: async () => ({ cues: CUES }), ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    stub.locale = 'en'
    stub.hasSavePermission = true
    stub.audio = 42
    stub.savedAudio = 42
    stub.subtitles = null

    IntroSubtitles = (await import('@/components/admin/IntroSubtitles/IntroSubtitles'))
      .IntroSubtitles as never

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  const render = () =>
    act(() => {
      root.render(createElement(IntroSubtitles as never, { sourceField: 'introAudio' }))
    })

  const buttons = () => [...container.querySelectorAll<HTMLButtonElement>('[data-button]')]

  const press = async () => {
    const button = buttons()[0]
    if (!button) throw new Error('no control rendered')
    await act(async () => {
      button.click()
    })
  }

  /** The subtitles POSTs the control has made, by URL. */
  const posts = (): string[] =>
    fetchMock.mock.calls
      .filter(([, init]) => isPost(init as RequestInit | undefined))
      .map(([url]) => String(url))

  it('renders nothing without a recording', () => {
    stub.audio = null
    stub.savedAudio = null
    render()

    expect(buttons()).toHaveLength(0)
  })

  // A control the server would only refuse is not an offer.
  it('renders nothing for a reader who cannot save the document', () => {
    stub.hasSavePermission = false
    render()

    expect(buttons()).toHaveLength(0)
  })

  it('writes the cues into form state and never to the server', async () => {
    render()
    await press()

    expect(stub.setValue).toHaveBeenCalledWith(CUES)
    // One POST, to the endpoint. Nothing here saves the lesson — that is the
    // admin's own Save, which is what makes Undo possible until then.
    expect(posts()).toEqual(['/api/files/42/subtitles?locale=en'])
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/lessons')),
    ).toHaveLength(0)
  })

  // ⚠ The latch. A locale switch mid-run must discard the resolve: the cues
  // were transcribed in the previous language, and writing them would put
  // Czech words in the German field.
  it('discards a resolve whose starting locale is no longer the field one', async () => {
    let settle: (value: unknown) => void = () => {}
    fetchMock.mockImplementation(
      (_url, init: RequestInit | undefined) =>
        new Promise((resolve) => {
          if (isPost(init)) settle = resolve
          else resolve({ json: async () => ({}), ok: true, status: 200 })
        }),
    )

    render()
    await press()
    expect(stub.setValue).not.toHaveBeenCalled()

    // The admin switches language while the run is in flight.
    stub.locale = 'de'
    render()

    await act(async () => {
      settle({ json: async () => ({ cues: CUES }), ok: true, status: 200 })
    })

    expect(stub.setValue).not.toHaveBeenCalled()
  })

  // The other half of the latch, and the one that needs each run's cues told
  // apart: swapping the recording legitimately starts a run for the new file,
  // so "nothing was written" would pass for the wrong reason.
  it('discards a resolve whose source file is no longer the field one', async () => {
    const pending: { url: string; settle: (value: unknown) => void }[] = []
    fetchMock.mockImplementation(
      (url: string, init: RequestInit | undefined) =>
        new Promise((resolve) => {
          if (isPost(init)) pending.push({ settle: resolve, url })
          else resolve({ json: async () => ({}), ok: true, status: 200 })
        }),
    )

    render()
    await press()
    expect(pending).toHaveLength(1)
    expect(pending[0]!.url).toContain('/api/files/42/')

    // The admin attaches a different recording while the run is in flight.
    stub.audio = 99
    render()

    // The first file's run comes back late.
    await act(async () => {
      pending[0]!.settle({ json: async () => ({ cues: cuesFor(42) }), ok: true, status: 200 })
    })

    expect(stub.setValue).not.toHaveBeenCalledWith(cuesFor(42))
  })

  // A second run would pay the vendor twice and race the first into the field,
  // so the control is not offered at all while one is in flight — the in-flight
  // flag behind it is the belt to this braces.
  it('offers no second run while one is in flight', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit | undefined) =>
      isPost(init)
        ? new Promise(() => {})
        : Promise.resolve({ json: async () => ({}), ok: true, status: 200 }),
    )

    render()
    await press()

    expect(posts()).toHaveLength(1)
    expect(buttons()).toHaveLength(0)
    expect(container.querySelector('[data-spinner]')).not.toBeNull()
  })

  it('reports the endpoint refusal in the words the endpoint chose', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        errors: [{ message: 'Subtitles can only be made from an MP3 recording.' }],
      }),
      ok: false,
      status: 415,
    })

    render()
    await press()

    expect(container.textContent).toContain('MP3')
    expect(stub.setValue).not.toHaveBeenCalled()
  })

  // `useLocale()`'s context default is `{}`, so this is reachable at runtime —
  // and a request naming no locale is the #701 403, silently.
  it('refuses to run at all with no locale, rather than sending none', async () => {
    stub.locale = undefined
    render()
    await press()

    expect(posts()).toHaveLength(0)
    expect(stub.setValue).not.toHaveBeenCalled()
  })

  it('offers no automatic run for a saved step that has a recording and no cues', () => {
    render()

    expect(posts()).toHaveLength(0)
  })

  // The one automatic run: a recording attached in this session, with no cues
  // yet, so the common path costs no click.
  it('runs by itself when a recording is attached in this session', async () => {
    render()
    stub.audio = 77
    await act(async () => {
      root.render(createElement(IntroSubtitles as never, { sourceField: 'introAudio' }))
    })

    expect(posts()).toEqual(['/api/files/77/subtitles?locale=en'])
  })

  it('never runs by itself over cues that already exist', async () => {
    stub.subtitles = CUES
    render()
    stub.audio = 77
    await act(async () => {
      root.render(createElement(IntroSubtitles as never, { sourceField: 'introAudio' }))
    })

    expect(posts()).toHaveLength(0)
    expect(stub.openModal).not.toHaveBeenCalled()
  })
})
