/**
 * @vitest-environment jsdom
 *
 * The Transcript tab's DOM facts, which no pure spec can state: what a phrase
 * is as an element, which one carries `aria-current`, what a key press seeks
 * to, and which notice each phase renders.
 *
 * **Mocked at the Payload boundary only** — `@payloadcms/ui` and `swr`. Four
 * behaviours are reproduced, each read from the real thing:
 *
 * - `useSWR(key, fetcher, options)` makes no request for a null key, and calls
 *   `refreshInterval` with the latest data
 *   (`swr/dist/index/index.mjs`, `useSWRHandler`).
 * - `useDocumentInfo().id` is the saved document's id.
 * - `useLocale().code` is the active admin locale, and its context default is
 *   `{}`, so the code can be `undefined` at runtime (#701).
 * - `useLivePreviewContext().iframeRef` is the live-preview iframe, which is
 *   where both playhead seams reach: `usePlaybackTime` subscribes to its
 *   origin and `useSeekToTime` posts back to it.
 *
 * Everything under test is therefore our own: the playhead arrives as a real
 * `PLAYBACK_TIME_UPDATE` message through `playbackTimeStore`, and a seek is
 * read off the iframe's own `postMessage`.
 */
import type { UIFieldClientComponent } from 'payload'
import type { ReactNode } from 'react'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetPlaybackTimeStoreForTests } from '@/components/admin/FrameEditor/playbackTimeStore'
import { TRANSCRIPTION_STALL_MS } from '@/lib/meditations/transcript'
import type { MeditationTranscript } from '@/payload-types'

const PREVIEW_ORIGIN = 'https://preview.example'

const postMessage = vi.fn()
const iframeRef = {
  current: { src: `${PREVIEW_ORIGIN}/preview/embed`, contentWindow: { postMessage } },
}

/** What the stubs answer, reset per case. */
const stub = vi.hoisted(() => ({
  id: 7 as number | undefined,
  locale: 'en' as string | undefined,
  swr: { data: undefined as unknown, error: undefined as unknown },
  swrCalls: [] as { key: unknown; options: { refreshInterval?: unknown } }[],
  iframe: null as unknown,
}))

vi.mock('@payloadcms/ui', () => ({
  Banner: ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-banner': 'true' }, children),
  Spinner: ({ loadingText }: { loadingText?: string | null }) =>
    createElement('div', { 'data-spinner': 'true' }, loadingText),
  useDocumentInfo: () => ({ id: stub.id }),
  useLocale: () => ({ code: stub.locale }),
  useLivePreviewContext: () => ({ iframeRef: stub.iframe, url: '' }),
}))

vi.mock('swr', () => ({
  default: (key: unknown, _fetcher: unknown, options: { refreshInterval?: unknown }) => {
    stub.swrCalls.push({ key, options })
    return { data: stub.swr.data, error: stub.swr.error }
  },
}))

const cue = (content: string, startTimeMs: number, endTimeMs: number) => ({
  content,
  startTimeMs,
  endTimeMs,
})

/**
 * A row as the collection answers it. Typed against the generated row, so a
 * schema change fails `pnpm typecheck:tests` rather than at runtime — the
 * shape it assumes is `src/collections/MeditationTranscripts/MeditationTranscripts.ts`,
 * whose `status` and `error` are virtual and whose `segments` is nullable.
 */
const row = (overrides: Partial<MeditationTranscript> = {}): MeditationTranscript => ({
  id: 1,
  meditation: 7,
  audioFilename: 'calm.mp3',
  provider: 'lemonfox',
  language: 'en',
  segments: null,
  status: 'completed',
  error: null,
  updatedAt: new Date().toISOString(),
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
})

const SEGMENTS = [
  cue('Close your eyes.', 2000, 4000),
  cue('Let the breath settle.', 4500, 6000),
  cue('Rest your attention here.', 91120, 95000),
]

describe('the Transcript tab', () => {
  let MeditationTranscript: UIFieldClientComponent
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    vi.resetModules()
    __resetPlaybackTimeStoreForTests()
    postMessage.mockClear()
    stub.id = 7
    stub.locale = 'en'
    stub.swr = { data: { docs: [row({ segments: SEGMENTS })] }, error: undefined }
    stub.swrCalls = []
    stub.iframe = iframeRef

    MeditationTranscript = (
      await import('@/components/admin/MeditationTranscript/MeditationTranscript')
    ).MeditationTranscript

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    __resetPlaybackTimeStoreForTests()
  })

  const render = () => {
    act(() => {
      root.render(createElement(MeditationTranscript as never))
    })
  }

  /** The playhead, as the preview reports it: whole seconds, from its origin. */
  const playTo = (seconds: number) => {
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'PLAYBACK_TIME_UPDATE', currentTime: seconds },
          origin: PREVIEW_ORIGIN,
        }),
      )
    })
  }

  const phrases = () => [...container.querySelectorAll<HTMLElement>('[role="button"]')]
  const current = () => container.querySelector<HTMLElement>('[aria-current="true"]')
  const text = () => container.textContent ?? ''

  const press = (element: HTMLElement, key: string) => {
    act(() => {
      element.dispatchEvent(
        new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      )
    })
  }

  describe('keyboard reach', () => {
    it('makes every phrase a focusable span, and no phrase a button element', () => {
      render()

      expect(phrases()).toHaveLength(SEGMENTS.length)
      expect(phrases().map((phrase) => phrase.tagName)).toEqual(['SPAN', 'SPAN', 'SPAN'])
      expect(phrases().map((phrase) => phrase.getAttribute('tabindex'))).toEqual(['0', '0', '0'])
    })

    it.each([
      ['Enter', 1, 4],
      [' ', 2, 91],
    ] as const)('seeks on %s to the phrase’s own whole second', (key, index, expected) => {
      render()

      press(phrases()[index], key)

      expect(postMessage).toHaveBeenCalledExactlyOnceWith(
        { type: 'SEEK_TO_TIME', timestamp: expected },
        PREVIEW_ORIGIN,
      )
    })

    it('leaves another key alone', () => {
      render()

      press(phrases()[0], 'a')

      expect(postMessage).not.toHaveBeenCalled()
    })
  })

  describe('read-along', () => {
    it('marks the phrase the playhead is inside, and moves the mark with it', () => {
      render()
      playTo(3)

      expect(current()?.textContent).toBe('Close your eyes.')

      playTo(5)

      expect(current()?.textContent).toBe('Let the breath settle.')
    })

    it('marks the phrase from the whole second a click on it seeks to', () => {
      render()
      playTo(91)

      expect(current()?.textContent).toBe('Rest your attention here.')
    })

    it('marks nothing in a pause', () => {
      render()
      playTo(50)

      expect(current()).toBeNull()
    })

    it('puts the mark on the focusable phrase itself', () => {
      render()
      playTo(3)

      expect(current()?.getAttribute('role')).toBe('button')
      expect(current()?.getAttribute('tabindex')).toBe('0')
    })
  })

  describe('the notices', () => {
    const renderRow = (overrides: Partial<MeditationTranscript>) => {
      stub.swr = { data: { docs: [row(overrides)] }, error: undefined }
      render()
    }

    it('says nothing has been transcribed when the query returns no row', () => {
      stub.swr = { data: { docs: [] }, error: undefined }
      render()

      expect(text()).toContain('No transcript yet.')
      // The recording is Payload's own Upload control above the tabs, and
      // `restrictUploadToAdmin` refuses replacing it to a `meditations-editor`.
      // So the notice names no tab and asks the reader for nothing.
      expect(text()).not.toMatch(/tab/i)
      expect(phrases()).toHaveLength(0)
    })

    it('shows progress while a run is in flight', () => {
      renderRow({ status: 'processing' })

      expect(text()).toContain('Transcription in progress')
      expect(text()).not.toContain('stopped responding')
    })

    it('shows the failure and the run’s own message', () => {
      renderRow({ status: 'failed', error: 'Lemonfox refused the recording.' })

      expect(text()).toContain('Transcription failed.')
      expect(text()).toContain('Lemonfox refused the recording.')
    })

    it('shows the stopped-responding notice for a processing row past the stall bound', () => {
      renderRow({
        status: 'processing',
        updatedAt: new Date(Date.now() - TRANSCRIPTION_STALL_MS - 1000).toISOString(),
      })

      expect(text()).toContain('Transcription stopped responding.')
      expect(text()).not.toContain('Transcription in progress')
      // One bound, one spelling: the copy never names a duration.
      expect(text()).not.toMatch(/\d+\s*(minute|second|hour)/i)
    })

    // The row never changes here, which is the whole point: a stuck run answers
    // every poll with the same document, so SWR renders nothing and the bound
    // would otherwise pass unobserved.
    it('reaches the stall notice while mounted, on no new row', () => {
      vi.useFakeTimers()
      try {
        renderRow({ status: 'processing' })
        expect(text()).toContain('Transcription in progress')

        act(() => void vi.advanceTimersByTime(TRANSCRIPTION_STALL_MS + 1000))

        expect(text()).toContain('Transcription stopped responding.')
        expect(text()).not.toContain('Transcription in progress')
      } finally {
        vi.useRealTimers()
      }
    })

    it('renders a processing row’s cues beneath its notice', () => {
      renderRow({ status: 'processing', segments: SEGMENTS })

      expect(text()).toContain('Transcription in progress')
      expect(phrases()).toHaveLength(SEGMENTS.length)
    })

    // A row the server cannot emit, deliberately: `deriveTranscriptStatus`
    // answers `completed` from the cues, so this is the only fixture that
    // tells a cue gate from a `status === 'completed'` one.
    it('renders no paragraphs for a completed row carrying no cues', () => {
      renderRow({ status: 'completed', segments: [] })

      expect(phrases()).toHaveLength(0)
    })
  })

  describe('the request it makes', () => {
    it('names the active locale', () => {
      stub.locale = 'cs'
      render()

      expect(stub.swrCalls[0].key).toContain('locale=cs')
      expect(stub.swrCalls[0].key).toContain(
        `where${encodeURIComponent('[meditation][equals]')}=7`,
      )
    })

    it('builds no URL, makes no request and reports it without a locale (#701)', () => {
      stub.locale = undefined
      render()

      expect(stub.swrCalls.every((call) => call.key === null)).toBe(true)
      expect(container.querySelector('[data-banner]')).not.toBeNull()
      expect(text()).toContain('admin locale')
    })

    // The property is the function's **identity**, not its answer. The
    // mechanism is in `pollInterval`'s own ⚠ block.
    it('passes one `refreshInterval` function across re-renders', () => {
      render()
      playTo(3)
      playTo(4)

      expect(stub.swrCalls.length).toBeGreaterThan(2)
      const intervals = new Set(stub.swrCalls.map((call) => call.options.refreshInterval))
      expect(intervals.size).toBe(1)
      expect(typeof [...intervals][0]).toBe('function')
    })

    it('polls while and only while a run is in flight', () => {
      render()
      const refreshInterval = stub.swrCalls[0].options.refreshInterval as (
        latest?: unknown,
      ) => number

      expect(refreshInterval({ docs: [row({ status: 'processing' })] })).toBe(3000)
      expect(refreshInterval({ docs: [row({ status: 'completed' })] })).toBe(0)
      // The rest of the phase table is `meditation-transcript-model.spec.ts`'s.
      expect(refreshInterval(undefined)).toBe(0)
    })
  })
})
