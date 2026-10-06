/**
 * @vitest-environment jsdom
 *
 * `UploadNotice` — the feedback a multipart save gives nothing for (#888).
 *
 * It needs a DOM because the rule under test spans two provider values and the
 * point is that NEITHER alone is enough. Extracting the predicate would leave
 * the wiring — which hook feeds which half — untested, and the wiring is where
 * this ticket's sibling defects live.
 *
 * The stand-in reproduces the two `@payloadcms/ui` behaviours the component
 * relies on, both read from
 * `node_modules/@payloadcms/ui/dist/forms/Form/index.js`: `useFormProcessing()`
 * is true from submit until the response settles (and is reset on every early
 * return), and the staged upload sits in form state at the `file` path as a
 * real `File`, written by `<Upload>`'s `useField({ path: 'file' })`.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What the stubbed providers answer for the render under test. */
const form: { fields: Record<string, { value: unknown }>; processing: boolean } = {
  fields: {},
  processing: false,
}

vi.mock('@payloadcms/ui', () => ({
  Spinner: ({ loadingText }: { loadingText?: null | string }) =>
    createElement('div', { className: 'spinner' }, loadingText),
  useFormFields: (selector: (args: [Record<string, { value: unknown }>]) => unknown) =>
    selector([form.fields]),
  useFormProcessing: () => form.processing,
  useTranslation: () => ({
    t: (key: string) => (key === 'general:uploading' ? 'Nahrávání' : key),
  }),
}))

// `vi.mock` is hoisted above this import, so the component sees the stand-in.
import { UploadNotice } from '@/components/admin/UploadNotice/UploadNotice'

/** What the stubbed `t` answers for `general:uploading`, so a hardcoded
 * English label fails the assertion instead of passing it. */
const MESSAGE = 'Nahrávání'
const audio = () => new File(['x'], 'talk.mp3', { type: 'audio/mpeg' })

describe('UploadNotice', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    form.fields = {}
    form.processing = false

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const render = () => {
    act(() => {
      root.render(createElement(UploadNotice))
    })
  }

  it('shows the notice while a staged file is being posted', () => {
    form.processing = true
    form.fields = { file: { value: audio() } }

    render()

    expect(container.textContent).toContain(MESSAGE)
  })

  it('stays hidden on a save that posts no file', () => {
    form.processing = true
    form.fields = { title: { value: 'Renamed' } }

    render()

    expect(container.textContent).toBe('')
  })

  /**
   * Covers both the file staged but not yet submitted, and the save that has
   * settled — every submit path that bails calls `setProcessing(false)` and
   * leaves the staged file in form state, so a failed upload clears the notice
   * and leaves the error toast to speak.
   */
  it('stays hidden whenever the form is not processing', () => {
    form.fields = { file: { value: audio() } }

    render()

    expect(container.textContent).toBe('')
  })

  it('ignores a `file` path holding anything but a File', () => {
    form.processing = true
    form.fields = { file: { value: 'media/talk.mp3' } }

    render()

    expect(container.textContent).toBe('')
  })
})
