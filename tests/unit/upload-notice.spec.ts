/**
 * @vitest-environment jsdom
 *
 * `UploadNotice` — the one thing a multipart save gives no feedback for (#888).
 *
 * What needs a DOM is the component's whole subject: it renders on a
 * combination of two provider values, and the rule under test is that NEITHER
 * alone is enough. A pure helper could hold the predicate, but the predicate is
 * two hook calls and a `return null`, so extracting it would leave the wiring —
 * which hook feeds which half — untested, and the wiring is where #888's
 * sibling defects live.
 *
 * The stand-in reproduces the two `@payloadcms/ui` behaviours the component
 * relies on, both read from
 * `node_modules/@payloadcms/ui/dist/forms/Form/index.js`:
 * `useFormProcessing()` is true from submit until the response settles (and is
 * reset on every early return), and the staged upload sits in form state at the
 * `file` path as a real `File`, written by `<Upload>`'s
 * `useField({ path: 'file' })`.
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
}))

const MESSAGE = 'Uploading, please keep this page open'

describe('UploadNotice', () => {
  let UploadNotice: () => React.ReactNode
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    UploadNotice = (await import('@/components/admin/UploadNotice/UploadNotice')).UploadNotice

    form.fields = {}
    form.processing = false

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const render = () => {
    act(() => {
      root.render(createElement(UploadNotice as never))
    })
  }

  it('shows the notice while a staged file is being posted', () => {
    form.processing = true
    form.fields = { file: { value: new File(['x'], 'talk.mp3', { type: 'audio/mpeg' }) } }

    render()

    expect(container.textContent).toContain(MESSAGE)
  })

  it('stays hidden on a save that posts no file', () => {
    form.processing = true
    form.fields = { title: { value: 'Renamed' } }

    render()

    expect(container.textContent).toBe('')
  })

  it('clears once processing ends, so a failed upload leaves the toast alone', () => {
    form.processing = true
    form.fields = { file: { value: new File(['x'], 'talk.mp3', { type: 'audio/mpeg' }) } }
    render()
    expect(container.textContent).toContain(MESSAGE)

    // Every submit path that bails — a validation failure, a thrown request —
    // calls setProcessing(false) and leaves the staged file in form state.
    form.processing = false
    render()

    expect(container.textContent).toBe('')
  })

  it('stays hidden while a file sits staged but unsubmitted', () => {
    form.fields = { file: { value: new File(['x'], 'talk.mp3', { type: 'audio/mpeg' }) } }

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
