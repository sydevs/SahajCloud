/**
 * @vitest-environment jsdom
 *
 * A file's Transcript panel — on the file's page and on a Path Step using the
 * file — reads along with a player of its own, where a meditation's follows
 * the live preview (`meditation-transcript-tab.spec.ts`). What this pins is
 * the part between the two: which element plays, what a click on a phrase
 * does to it, and how the element's playhead moves the mark.
 *
 * **Mocked at the Payload boundary only** — `@payloadcms/ui` and `swr`, with
 * the behaviours `meditation-transcript-tab.spec.ts` reads off the real thing.
 * jsdom implements no media playback, so each case gives the element a
 * writable `currentTime` and a `play` it can count.
 */
import type { ReactNode } from 'react'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TranscribedFile } from '@/components/admin/RecordingTranscript'
import type { Transcript } from '@/payload-types'

const stub = vi.hoisted(() => ({
  locale: 'cs' as string | undefined,
  swr: { data: undefined as unknown, error: undefined as unknown },
  mutate: vi.fn(),
}))

vi.mock('@payloadcms/ui', () => ({
  Banner: ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-banner': 'true' }, children),
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) =>
    createElement('button', { 'data-retry': 'true', onClick, type: 'button' }, children),
  ErrorIcon: () => null,
  FieldLabel: ({ label }: { label?: string }) => createElement('label', null, label),
  InfoIcon: () => null,
  SelectInput: ({ label, value }: { label?: string; value?: string }) =>
    createElement('div', { 'data-select': label }, value),
  Spinner: ({ loadingText }: { loadingText?: string | null }) =>
    createElement('div', { 'data-spinner': 'true' }, loadingText),
  SuccessIcon: () => null,
  toast: { error: vi.fn(), success: vi.fn() },
  useAuth: () => ({ user: { collection: 'managers', type: 'admin' } }),
  useDocumentInfo: () => ({ data: {}, id: 3 }),
  useLocale: () => ({ code: stub.locale }),
  WarningIcon: () => null,
}))

vi.mock('swr', () => ({
  default: () => ({ data: stub.swr.data, error: stub.swr.error, mutate: stub.mutate }),
}))

const cue = (content: string, startTimeMs: number, endTimeMs: number) => ({
  content,
  startTimeMs,
  endTimeMs,
})

const SEGMENTS = [cue('Sit comfortably.', 10000, 12400), cue('Close your eyes.', 12800, 14000)]

const row = (overrides: Partial<Transcript> = {}): Transcript => ({
  id: 1,
  source: { relationTo: 'files', value: 9 },
  audioFilename: 'intro.mp3',
  provider: 'lemonfox',
  language: 'cs',
  segments: SEGMENTS,
  status: 'completed',
  error: null,
  updatedAt: new Date().toISOString(),
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
})

const AUDIO: TranscribedFile = {
  filename: 'intro.mp3',
  id: 9,
  mimeType: 'audio/mpeg',
  mp4Url: null,
  url: 'https://r2.example/intro.mp3',
}

const VIDEO: TranscribedFile = {
  filename: 'panel.mp4',
  id: 14,
  mimeType: 'video/mp4',
  mp4Url: 'https://stream.example/panel/downloads/default.mp4',
  url: 'https://stream.example/panel/manifest/video.m3u8',
}

describe('a file’s Transcript panel', () => {
  let container: HTMLDivElement
  let root: Root
  let play: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    stub.locale = 'cs'
    stub.swr = { data: { docs: [row()] }, error: undefined }
    play = vi.fn(() => Promise.resolve())
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = async (file: TranscribedFile, checkLanguage = false) => {
    const { FileRecordingTranscript } = await import('@/components/admin/RecordingTranscript')
    act(() => {
      root.render(
        createElement(FileRecordingTranscript, { checkLanguage, file, label: 'Subtitles' }),
      )
    })
    const media = container.querySelector<HTMLMediaElement>('audio, video')
    if (media) {
      Object.defineProperty(media, 'currentTime', { configurable: true, value: 0, writable: true })
      media.play = play as never
    }
    return media
  }

  const phrases = () => [...container.querySelectorAll<HTMLElement>('[role="button"]')]
  const current = () => container.querySelector<HTMLElement>('[aria-current="true"]')
  const text = () => container.textContent ?? ''

  describe('the player', () => {
    it('plays an audio file from its own address', async () => {
      const media = await render(AUDIO)

      expect(media?.tagName).toBe('AUDIO')
      expect(media?.getAttribute('src')).toBe(AUDIO.url)
      expect(phrases()).toHaveLength(SEGMENTS.length)
    })

    it('plays a transcribed video from its MP4, never its HLS manifest', async () => {
      const media = await render(VIDEO)

      expect(media?.tagName).toBe('VIDEO')
      expect(media?.getAttribute('src')).toBe(VIDEO.mp4Url)
    })

    // Stream makes the MP4 only once the video is ready, which the run waits
    // for — so before there are cues, its address answers 404.
    it('offers no player for a video with nothing transcribed yet', async () => {
      stub.swr = {
        data: { docs: [row({ segments: null, status: 'processing' })] },
        error: undefined,
      }
      const media = await render(VIDEO)

      expect(media).toBeNull()
      expect(text()).toContain('Transcription in progress')
    })

    it('keeps an audio file playable while its transcript is on its way', async () => {
      stub.swr = {
        data: { docs: [row({ segments: null, status: 'processing' })] },
        error: undefined,
      }
      const media = await render(AUDIO)

      expect(media?.tagName).toBe('AUDIO')
    })
  })

  describe('reading along', () => {
    it('plays from a clicked phrase’s own start, to the millisecond', async () => {
      const media = await render(AUDIO)

      act(() => phrases()[1].click())

      expect(media?.currentTime).toBe(12.8)
      expect(play).toHaveBeenCalledOnce()
      expect(current()?.textContent).toBe('Close your eyes.')
    })

    it('marks the phrase the player reaches, and moves the mark with it', async () => {
      const media = await render(AUDIO)
      const reach = (seconds: number) =>
        act(() => {
          if (!media) return
          media.currentTime = seconds
          media.dispatchEvent(new Event('timeupdate'))
        })

      reach(11)
      expect(current()?.textContent).toBe('Sit comfortably.')

      reach(12.5)
      expect(current()?.textContent).toBe('Sit comfortably.')

      reach(13)
      expect(current()?.textContent).toBe('Close your eyes.')
    })

    it('follows a seek made on the player itself', async () => {
      const media = await render(AUDIO)

      act(() => {
        if (!media) return
        media.currentTime = 13
        media.dispatchEvent(new Event('seeked'))
      })

      expect(current()?.textContent).toBe('Close your eyes.')
    })

    it('plays from a paragraph’s timestamp', async () => {
      const media = await render(AUDIO)

      act(() =>
        container.querySelector<HTMLButtonElement>('button[aria-label^="Play from"]')?.click(),
      )

      expect(media?.currentTime).toBe(10)
      expect(play).toHaveBeenCalledOnce()
    })
  })

  describe('the language', () => {
    it('offers the spoken language once a run has answered', async () => {
      await render(AUDIO)

      expect(container.querySelector('[data-select="Spoken language"]')?.textContent).toBe('cs')
    })

    it('offers no language while a run is in flight', async () => {
      stub.swr = {
        data: { docs: [row({ segments: null, status: 'processing' })] },
        error: undefined,
      }
      await render(AUDIO)

      expect(container.querySelector('[data-select]')).toBeNull()
    })

    it('warns when the recording is not in the language being edited', async () => {
      stub.locale = 'fr'
      await render(AUDIO, true)

      expect(text()).toContain('This recording is in Czech')
    })

    it('warns of nothing for a panel video, shown to every language as it is', async () => {
      stub.locale = 'fr'
      await render(AUDIO, false)

      expect(text()).not.toContain('This recording is in')
    })
  })

  it('names a failure in a title with no full stop, and offers it again', async () => {
    stub.swr = {
      data: {
        docs: [
          row({
            segments: null,
            status: 'failed',
            error: 'No Lemonfox key.',
            createdAt: '2026-01-01T00:00:00.000Z',
          }),
        ],
      },
      error: undefined,
    }
    await render(AUDIO)

    expect(text()).toContain('Transcription failed')
    expect(text()).not.toContain('Transcription failed.')
    expect(container.querySelector('[data-retry]')?.textContent).toBe('Transcribe again')
  })
})
