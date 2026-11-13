/**
 * @vitest-environment jsdom
 *
 * A file's Transcript panel — on the file's page and under a Path Step's
 * upload field — reads along with a player framed with it, where a
 * meditation's follows the live preview (`meditation-transcript-tab.spec.ts`).
 * What this pins is the part between the two: which element plays, what a
 * click on a phrase does to it, and how the element's playhead moves the mark;
 * when a Path Step warns that the file is spoken in another language; and which
 * file shows a Spoken language select at all.
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

import type { TranscribedFile } from '@/components/admin/TranscriptPanel'
import { formIsRecording } from '@/lib/transcripts/media'
import type { Transcript } from '@/payload-types'

const stub = vi.hoisted(() => ({
  locale: 'cs' as string | undefined,
  swr: { data: undefined as unknown, error: undefined as unknown },
  /** What a Path Step's file read answers: `/api/files?…`. */
  file: undefined as unknown,
  /** The upload field's value — the file id a Path Step holds. */
  fieldValue: undefined as unknown,
  /** The saved document on the file's own page. */
  doc: undefined as Partial<TranscribedFile> | undefined,
  /** Which collection the edited document is in, and when it was last saved. */
  collectionSlug: 'files' as string,
  lastUpdateTime: 1,
  mutate: vi.fn(),
}))

vi.mock('@payloadcms/ui', () => ({
  Banner: ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-banner': 'true' }, children),
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) =>
    createElement('button', { 'data-retry': 'true', onClick, type: 'button' }, children),
  // Payload's own keeps its content mounted while closed, under a zero height.
  Collapsible: ({
    children,
    header,
    initCollapsed,
  }: {
    children?: ReactNode
    header?: ReactNode
    initCollapsed?: boolean
  }) =>
    createElement(
      'div',
      { 'data-collapsible': initCollapsed ? 'closed' : 'open' },
      createElement('div', { 'data-collapsible-header': 'true' }, header),
      children,
    ),
  ErrorIcon: () => null,
  FieldLabel: ({ label }: { label?: string }) => createElement('label', null, label),
  InfoIcon: () => null,
  Spinner: ({ loadingText }: { loadingText?: string | null }) =>
    createElement('div', { 'data-spinner': 'true' }, loadingText),
  SuccessIcon: () => null,
  toast: { error: vi.fn(), success: vi.fn() },
  useAuth: () => ({ user: { collection: 'managers', type: 'admin' } }),
  useDocumentInfo: () => ({
    collectionSlug: stub.collectionSlug,
    data: stub.doc,
    id: stub.doc?.id,
    lastUpdateTime: stub.lastUpdateTime,
  }),
  useField: () => ({ value: stub.fieldValue }),
  useFieldPath: () => 'introAudio',
  /** The form's fields by path: the upload field beside the transcript. */
  useFormFields: (select: (context: [Record<string, { value: unknown }>]) => unknown) =>
    select([{ introAudio: { value: stub.fieldValue } }]),
  useLocale: () => ({ code: stub.locale }),
  WarningIcon: () => null,
}))

vi.mock('swr', () => ({
  default: (key: unknown) =>
    typeof key === 'string' && key.startsWith('/api/files')
      ? { data: { docs: stub.file ? [stub.file] : [] }, error: undefined, mutate: stub.mutate }
      : key === null
        ? { data: undefined, error: undefined, mutate: stub.mutate }
        : { data: stub.swr.data, error: stub.swr.error, mutate: stub.mutate },
}))

const cue = (content: string, startTimeMs: number, endTimeMs: number) => ({
  content,
  startTimeMs,
  endTimeMs,
})

const SEGMENTS = [cue('Sit comfortably.', 10000, 12400), cue('Close your eyes.', 12800, 14000)]

/**
 * The source as `transcriptUrl` reads a file's row: populated with the file's
 * `spokenLanguage` and nothing else.
 */
const spokenIn = (spokenLanguage: string | null): Transcript['source'] => ({
  relationTo: 'files',
  value: { id: 9, spokenLanguage } as never,
})

const row = (overrides: Partial<Transcript> = {}): Transcript => ({
  id: 1,
  source: spokenIn('cs'),
  audioFilename: 'intro.mp3',
  provider: 'lemonfox',
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
    stub.file = AUDIO
    stub.fieldValue = AUDIO.id
    stub.doc = AUDIO
    stub.collectionSlug = 'files'
    stub.lastUpdateTime = 1
    stub.mutate.mockClear()
    play = vi.fn(() => Promise.resolve())
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  /** What a panel's player is made of in jsdom, which plays nothing. */
  const playable = () => {
    const media = container.querySelector<HTMLMediaElement>('audio, video')
    if (media) {
      Object.defineProperty(media, 'currentTime', { configurable: true, value: 0, writable: true })
      media.play = play as never
    }
    return media
  }

  /** The player and transcript alone, as both places frame them. */
  const render = async (file: TranscribedFile) => {
    const { FileTranscript } = await import('@/components/admin/TranscriptPanel')
    act(() => {
      root.render(createElement(FileTranscript, { file }))
    })
    return playable()
  }

  const mount = (component: unknown, props: Record<string, unknown> = {}) => {
    act(() => {
      root.render(createElement(component as never, props as never))
    })
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

    // The MP4 outlives the run that read it: a failure after Stream made the
    // download is exactly when an editor wants to hear the recording.
    it('plays a video whose transcription failed', async () => {
      stub.swr = {
        data: { docs: [row({ segments: null, status: 'failed', error: 'Lemonfox 500' })] },
        error: undefined,
      }
      const media = await render(VIDEO)

      expect(media?.tagName).toBe('VIDEO')
      expect(media?.getAttribute('src')).toBe(VIDEO.mp4Url)
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

  describe('the frame', () => {
    it('holds the player and the transcript together', async () => {
      await render(AUDIO)

      const frame = container.querySelector('audio')?.parentElement?.parentElement
      expect(frame?.querySelector('[role="button"]')).not.toBeNull()
    })

    it('frames the player alone while there is nothing to read yet', async () => {
      stub.swr = {
        data: { docs: [row({ segments: null, status: 'processing' })] },
        error: undefined,
      }
      await render(AUDIO)

      expect(container.querySelector('audio')).not.toBeNull()
      expect(phrases()).toHaveLength(0)
    })
  })

  describe('on the file’s own page', () => {
    const mountFilePanel = async () => {
      const { FileTranscriptField } = await import('@/components/admin/TranscriptPanel')
      mount(FileTranscriptField, { path: 'transcriptPanel' })
    }

    // The transcript is the point of this page, so it is never folded away.
    it('shows the transcript open, under a label of its own', async () => {
      await mountFilePanel()

      expect(container.querySelector('label')?.textContent).toBe('Transcript')
      expect(container.querySelector('audio')).not.toBeNull()
      expect(container.querySelector('[data-collapsible]')).toBeNull()
    })

    // A PDF or an image has no transcript, and the page shows no panel at all.
    it('shows nothing for a file with no transcript to have', async () => {
      stub.doc = { ...AUDIO, mimeType: 'application/pdf' }
      await mountFilePanel()

      expect(container.innerHTML).toBe('')
    })

    // A save that changes the language or the recording replaces the row, and
    // a finished row is not polled — so the save itself has to re-read it.
    it('reads the transcript again when the file is saved, and not on load', async () => {
      await mountFilePanel()
      expect(stub.mutate).not.toHaveBeenCalled()

      stub.lastUpdateTime = 2
      await mountFilePanel()

      expect(stub.mutate).toHaveBeenCalledOnce()
    })
  })

  // `admin.condition`'s own input, which is form state reduced to values: the
  // stored `mimeType` on a saved file, and the staged `file` on the create
  // form, where nothing is stored yet.
  describe('the Spoken language field’s condition', () => {
    const chosen = (name: string, type: string) => new File([''], name, { type })

    // Where the type is read from — the stored one, or the chosen file's — not
    // which types count. The title takes the first two values, so the object
    // comes last.
    it.each([
      ['a saved audio file', true, { mimeType: 'audio/mpeg' }],
      ['a saved image', false, { mimeType: 'image/png' }],
      ['no file chosen yet', false, {}],
      ['an MP3 chosen', true, { file: chosen('intro.mp3', 'audio/mpeg') }],
      ['an image chosen', false, { file: chosen('cover.jpg', 'image/jpeg') }],
    ])('on %s: shown %s', (_label, expected, data) => {
      expect(formIsRecording(data)).toBe(expected)
    })
  })

  describe('under a Path Step’s upload field', () => {
    const mountUnderField = async () => {
      const { FileTranscriptField } = await import('@/components/admin/TranscriptPanel')
      mount(FileTranscriptField, { fileField: 'introAudio', path: 'introTranscript' })
    }

    // The step's own save changes nothing about its files' transcripts.
    it('reads nothing again when the step is saved', async () => {
      stub.collectionSlug = 'lessons'
      stub.doc = { id: 4 } as Partial<TranscribedFile>
      await mountUnderField()

      stub.lastUpdateTime = 2
      await mountUnderField()

      expect(stub.mutate).not.toHaveBeenCalled()
    })

    // The upload field above already names the recording.
    it('shows the file the sibling field holds, with no label of its own', async () => {
      await mountUnderField()

      expect(container.querySelector('audio')?.getAttribute('src')).toBe(AUDIO.url)
      expect(container.querySelector('label')).toBeNull()
    })

    it('folds the player and transcript closed behind a header', async () => {
      await mountUnderField()

      const fold = container.querySelector('[data-collapsible]')
      expect(fold?.getAttribute('data-collapsible')).toBe('closed')
      expect(fold?.querySelector('[data-collapsible-header]')?.textContent).toBe(
        'Transcript · 2 lines',
      )
      expect(fold?.querySelector('audio')).not.toBeNull()
      expect(fold?.querySelectorAll('[role="button"]')).toHaveLength(SEGMENTS.length)
    })

    // Nothing to read yet, so nothing to fold: the player stays in reach.
    it('leaves the player unfolded while there is nothing to read', async () => {
      stub.swr = {
        data: { docs: [row({ segments: null, status: 'processing' })] },
        error: undefined,
      }
      await mountUnderField()

      expect(container.querySelector('[data-collapsible]')).toBeNull()
      expect(container.querySelector('audio')).not.toBeNull()
    })

    it('shows nothing for a file with no transcript to have', async () => {
      stub.file = { ...AUDIO, mimeType: 'image/png' }
      await mountUnderField()

      expect(container.innerHTML).toBe('')
    })

    it('shows nothing with no file chosen', async () => {
      stub.fieldValue = null
      stub.file = undefined
      await mountUnderField()

      expect(container.innerHTML).toBe('')
    })
  })

  describe('the language warning above an intro recording', () => {
    const mountWarning = async () => {
      const { RecordingLanguageWarning } = await import('@/components/admin/TranscriptPanel')
      mount(RecordingLanguageWarning)
    }

    it('warns when the recording is in another language than the one edited', async () => {
      stub.locale = 'fr'
      await mountWarning()

      expect(text()).toBe(
        "Incorrect audio languageThis recording is in Czech, but you are editing French. Choose a recording in French, or ask an admin to correct the file's spoken language if it is wrong.",
      )
      expect(container.querySelector('[data-banner]')).not.toBeNull()
    })

    // The language is the file's, so one stated on upload warns before a run
    // has produced a line.
    it('warns while the transcript is still on its way', async () => {
      stub.locale = 'fr'
      stub.swr = {
        data: { docs: [row({ segments: null, status: 'processing' })] },
        error: undefined,
      }
      await mountWarning()

      expect(container.querySelector('[data-banner]')).not.toBeNull()
    })

    it('says nothing in the recording’s own language', async () => {
      await mountWarning()

      expect(container.innerHTML).toBe('')
    })

    // Nobody stated one, and the run has not detected one yet.
    it('says nothing while the file states no language', async () => {
      stub.locale = 'fr'
      stub.swr = {
        data: { docs: [row({ source: spokenIn(null), segments: null, status: 'processing' })] },
        error: undefined,
      }
      await mountWarning()

      expect(container.innerHTML).toBe('')
    })

    it('says nothing with no file chosen', async () => {
      stub.locale = 'fr'
      stub.fieldValue = null
      await mountWarning()

      expect(container.innerHTML).toBe('')
    })
  })

  // A video uploaded before #1016 has no row and no second Stream `ready`
  // webhook coming, so this button is where its language is acted on: saving
  // `spokenLanguage` alone starts no run for it (`syncTranscriptOnSave`).
  it('offers a first transcription for a recording that has none', async () => {
    stub.swr = { data: { docs: [] }, error: undefined }
    await render(VIDEO)

    expect(text()).toContain('No transcript yet')
    expect(container.querySelector('[data-retry]')?.textContent).toBe('Transcribe')
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
