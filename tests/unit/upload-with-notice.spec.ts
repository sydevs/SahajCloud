/**
 * @vitest-environment jsdom
 *
 * `UploadWithNotice` — what it hands Payload's `<Upload>` (#888).
 *
 * The subject is wiring, which is the one thing neither a pure spec nor the
 * type-checker can see: `initialState` is optional, so omitting it compiles,
 * renders, and looks correct on the edit view. It is load-bearing only in the
 * Bulk Upload drawer, where each file is staged into its own form before the
 * component mounts — `<Upload>` sets `fileSrc` from `initialState` there, and
 * gates the whole staged-file block on it. Payload hands a replacement Upload
 * component no props at all, so the value has to come off
 * `useDocumentInfo()`, and that is the step a reviewer caught missing.
 *
 * Asserting the props rather than the rendered file is deliberate: the
 * staged-file block belongs to `@payloadcms/ui`, and `tests/AGENTS.md` says to
 * test our contracts with a library, not the library.
 *
 * The stand-in reproduces what both of Payload's own render sites read, from
 * `node_modules/@payloadcms/ui/dist/views/Edit/index.js` and
 * `.../elements/BulkUpload/EditForm/index.js`: `initialState` and the custom
 * Upload node both come from `useDocumentInfo()`, and the collection's
 * `upload` config from `useConfig().getEntityConfig`.
 */
import type { FormState } from 'payload'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What the stubbed providers answer, and what `<Upload>` was handed. */
const doc: { collectionSlug: string | undefined; initialState: FormState | undefined } = {
  collectionSlug: 'images',
  initialState: undefined,
}
const uploadConfig: { value: unknown } = { value: { staticDir: 'media/images' } }
let uploadProps: Record<string, unknown> | null = null

vi.mock('@payloadcms/ui', () => ({
  Upload: (props: Record<string, unknown>) => {
    uploadProps = props
    return createElement('div', { className: 'file-field' })
  },
  Spinner: () => null,
  useConfig: () => ({ getEntityConfig: () => ({ upload: uploadConfig.value }) }),
  useDocumentInfo: () => doc,
  useFormFields: () => undefined,
  useFormProcessing: () => false,
}))

describe('UploadWithNotice', () => {
  let UploadWithNotice: () => React.ReactNode
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    UploadWithNotice = (await import('@/components/admin/UploadNotice/UploadWithNotice'))
      .UploadWithNotice

    doc.collectionSlug = 'images'
    doc.initialState = undefined
    uploadConfig.value = { staticDir: 'media/images' }
    uploadProps = null

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const render = () => {
    act(() => {
      root.render(createElement(UploadWithNotice as never))
    })
  }

  it('forwards the form state a pre-staged file arrives in', () => {
    const staged = {
      file: { value: new File(['x'], 'photo.png', { type: 'image/png' }) },
    } as unknown as FormState
    doc.initialState = staged

    render()

    expect(uploadProps?.initialState).toBe(staged)
  })

  it('forwards the collection and its upload config', () => {
    render()

    expect(uploadProps?.collectionSlug).toBe('images')
    expect(uploadProps?.uploadConfig).toBe(uploadConfig.value)
  })

  it('renders nothing for a collection that takes no upload', () => {
    uploadConfig.value = undefined

    render()

    expect(uploadProps).toBeNull()
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing before the document info names a collection', () => {
    doc.collectionSlug = undefined

    render()

    expect(uploadProps).toBeNull()
    expect(container.innerHTML).toBe('')
  })
})
