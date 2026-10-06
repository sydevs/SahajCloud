/**
 * @vitest-environment jsdom
 *
 * The import run's wiring: which requests the Import tab actually sends, in
 * which order, and when it stops (#828).
 *
 * `importStepUrl`, `resolveVerdict` and `resolveProgress` are each pinned pure
 * in `event-import-run.spec.ts`. This file exists because that is not enough —
 * `docs/testing.md`'s #132: a helper can be spec'd four ways and never
 * destructured by its caller, leaving an arm that cannot occur in production
 * while every assertion about it stays green. The stall guard is exactly that
 * shape, so it is asserted through the loop that has to honour it.
 *
 * The `@payloadcms/ui` stand-in reproduces only what the component reads: a
 * `Dropzone` that hands over a `FileList`, a `Button` that clicks, a `Banner`
 * that renders its children, a `SelectInput` that renders nothing, `useLocale`,
 * and the `useConfig` the review surface below it reads its admin route from. The real module pulls stylesheets no node runner can load, which
 * is why `importGate` was extracted from `ImportView` for the same reason.
 */

import type { ReactNode } from 'react'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STALLED_REFUSAL, type OpenBatch } from '@/components/admin/RegionImport/runPlan'

/** What the stand-in last handed the component, and what it took back. */
const ui = vi.hoisted(() => ({
  dropped: null as null | ((files: FileList) => void),
  locale: 'de' as string | undefined,
}))

vi.mock('@payloadcms/ui', () => ({
  Banner: ({ children }: { children: ReactNode }) =>
    createElement('div', { role: 'status' }, children),
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick: () => void
  }) => createElement('button', { disabled, onClick }, children),
  Dropzone: ({
    children,
    onChange,
  }: {
    children: ReactNode
    onChange: (files: FileList) => void
  }) => {
    ui.dropped = onChange
    return createElement('div', null, children)
  },
  SelectInput: () => null,
  useConfig: () => ({ config: { routes: { admin: '/admin' } } }),
  useLocale: () => ({ code: ui.locale }),
}))

const { ImportRunner } = await import('@/components/admin/RegionImport/ImportRunner')

interface Call {
  body: unknown
  url: string
}

/** Scripted answers, one per request, in the order the run makes them. */
let answers: { body: unknown; ok: boolean; status?: number }[]
let calls: Call[]

beforeEach(() => {
  answers = []
  calls = []
  ui.dropped = null
  ui.locale = 'de'
  vi.stubGlobal('fetch', (url: string, init: { body?: string }) => {
    calls.push({ body: init.body ? JSON.parse(init.body) : undefined, url })
    const answer = answers.shift()
    if (!answer) throw new Error(`Unscripted request: ${url}`)
    return Promise.resolve({
      json: () => Promise.resolve(answer.body),
      ok: answer.ok,
      status: answer.status ?? (answer.ok ? 200 : 422),
    })
  })
  window.history.replaceState(null, '', '/admin/collections/regions/11/import')
})

/**
 * What `GET /:id/review` answers, for the read the review surface makes the
 * moment a finished run mounts it. Its own decisions are pinned in
 * `event-import-review-surface.spec.ts`; here it is one more request the tab
 * sends, which is this file's subject.
 */
const reviewAnswer = {
  coordinators: { created: 0, existing: 0, unlinked: 0 },
  inviteCoordinators: false,
  creating: 1,
  existing: 0,
  mappable: [],
  proposedRegions: {
    nodes: [],
    rowErrors: [],
    stateLayer: { proposed: false, reason: 'the batch spans one subdivision' },
  },
  rowErrors: 0,
  rows: [],
  status: 'resolved',
  target: { id: 11, level: 'country', name: 'Germany' },
}

const resolveReport = (over: Record<string, unknown>) => ({
  done: false,
  duplicates: 0,
  errors: 0,
  pending: 0,
  resolved: 0,
  total: 0,
  ...over,
})

async function mount(
  openBatches: OpenBatch[] = [],
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      createElement(ImportRunner, {
        apiRoute: '/api',
        defaultLanguages: ['de'],
        languageOptions: [{ label: 'German', value: 'de' }],
        openBatches,
        regionId: 11,
      }),
    )
  })
  return { container, root }
}

/**
 * Hand the component a file, the way the dropzone would.
 *
 * ⚠ A stand-in rather than a real `File`: jsdom 26 implements neither
 * `Blob.prototype.text` nor `arrayBuffer`, so `new File([...])` here would fail
 * on the method the component calls. What it reads is `name`, `size` and
 * `arrayBuffer()` — the bytes, so the strict UTF-8 decode is the real one.
 */
async function drop(
  name = 'classes.csv',
  content: string | Uint8Array = 'title,eventType\nYoga,offline\n',
) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  const file = {
    name,
    size: bytes.byteLength,
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(0)),
  } as unknown as File
  await act(async () => {
    ui.dropped?.({ item: () => file } as unknown as FileList)
  })
}

/** The run's own button, whichever way it is labelled. */
function runButton(container: HTMLElement): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((button) =>
    /^(Check this file|Resume)$/.test(button.textContent ?? ''),
  )
}

async function click(container: HTMLElement) {
  const button = runButton(container)
  await act(async () => {
    button?.click()
  })
}

describe('ImportRunner', () => {
  it('walks upload, then every resolve chunk, then the proposal', async () => {
    answers = [
      { body: { id: 5, rows: 2 }, ok: true },
      { body: resolveReport({ pending: 1, resolved: 1, total: 2 }), ok: true },
      { body: resolveReport({ done: true, pending: 0, resolved: 2, total: 2 }), ok: true },
      { body: { creating: 3, existing: 1, rowErrors: 0 }, ok: true },
      { body: reviewAnswer, ok: true },
    ]
    const { container } = await mount()
    await drop()
    await click(container)

    expect(calls.map((call) => call.url)).toEqual([
      '/api/event-imports/upload?locale=de',
      '/api/event-imports/5/resolve?locale=de',
      '/api/event-imports/5/resolve?locale=de',
      '/api/event-imports/5/propose?locale=de',
      '/api/event-imports/5/review?locale=de',
    ])
    // The uploader is never named in the body — the endpoint reads it off the
    // caller — so what the run owes is the target, the file and the languages.
    expect(calls[0]!.body).toEqual({
      csv: 'title,eventType\nYoga,offline\n',
      defaultLanguages: ['de'],
      targetRegion: 11,
    })
    // The rows are the run's own report. The regions this batch needs belong to
    // the review that mounts below it, from one spelling of that tally.
    expect(container.textContent).toContain('2 rows — 2 ready.')
    expect(container.textContent).toContain('1 new region.')
  })

  // The #132 shape. `resolveVerdict` answers `stalled`, and nothing proves the
  // loop reads that answer except a loop that would otherwise not end.
  it('stops asking once a chunk settles nothing, instead of looping forever', async () => {
    answers = [
      { body: { id: 5, rows: 9 }, ok: true },
      { body: resolveReport({ pending: 4, resolved: 5, total: 9 }), ok: true },
      { body: resolveReport({ pending: 4, resolved: 5, total: 9 }), ok: true },
    ]
    const { container } = await mount()
    await drop()
    await click(container)

    expect(calls).toHaveLength(3)
    expect(container.textContent).toContain(STALLED_REFUSAL)
  })

  // ⚠ A second upload would stage a second batch, whose rows the first batch's
  // committed classes then shadow as duplicates. So the retry is a resume.
  it('resumes a refused run against the same batch, never re-uploading', async () => {
    answers = [
      { body: { id: 5, rows: 2 }, ok: true },
      {
        body: { errors: [{ message: 'Geocoding is unavailable; try again shortly.' }] },
        ok: false,
      },
    ]
    const { container } = await mount()
    await drop()
    await click(container)
    expect(container.textContent).toContain('Geocoding is unavailable')

    answers = [
      { body: resolveReport({ done: true, pending: 0, resolved: 2, total: 2 }), ok: true },
      { body: { creating: 1, existing: 0, rowErrors: 0 }, ok: true },
      { body: reviewAnswer, ok: true },
    ]
    await click(container)

    expect(calls.map((call) => call.url)).toEqual([
      '/api/event-imports/upload?locale=de',
      '/api/event-imports/5/resolve?locale=de',
      '/api/event-imports/5/resolve?locale=de',
      '/api/event-imports/5/propose?locale=de',
      '/api/event-imports/5/review?locale=de',
    ])
  })

  // #701: a request naming no locale resolves to the default one server-side,
  // so the manager who holds the grant elsewhere gets a 403 saying nothing.
  it('sends nothing at all when the page cannot say which locale it is in', async () => {
    ui.locale = undefined
    const { container } = await mount()
    await drop()
    await click(container)

    expect(calls).toEqual([])
    expect(container.textContent).toContain('could not tell which language')
  })

  // ⚠ `busy` is derived from `phase`, which React has not applied yet when the
  // second click lands — so the disabled button is no bound at all here.
  it('stages one batch for two clicks in the same tick', async () => {
    answers = [
      { body: { id: 5, rows: 1 }, ok: true },
      { body: resolveReport({ done: true, pending: 0, resolved: 1, total: 1 }), ok: true },
      { body: { creating: 1, existing: 0, rowErrors: 0 }, ok: true },
    ]
    const { container } = await mount()
    await drop()
    const button = runButton(container)
    await act(async () => {
      button?.click()
      button?.click()
    })

    expect(calls.filter((call) => call.url.endsWith('upload?locale=de'))).toHaveLength(1)
  })

  // `fetch` rejects rather than answering when the connection drops, and the
  // click that started the run cannot report anything.
  it('ends a dropped connection somewhere the volunteer can resume from', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network')))
    const { container } = await mount()
    await drop()
    await click(container)

    expect(container.textContent).toContain('Check your connection')
    expect(runButton(container)?.disabled).toBe(false)
  })

  it('offers no run until a file is chosen', async () => {
    const { container } = await mount()
    expect(runButton(container)?.disabled).toBe(true)
    await drop()
    expect(runButton(container)?.disabled).toBe(false)
  })

  /**
   * ⚠ Payload's `Dropzone` takes a drop or a paste, nothing else — so without a
   * real file input a keyboard, screen-reader or tablet user could not upload.
   */
  it('offers a file input beside the drop zone', async () => {
    const { container } = await mount()
    expect(container.querySelector('input[type="file"]')).not.toBeNull()
    expect(container.textContent).toContain('Choose a file')
  })

  // A Windows Excel "CSV" is Windows-1252, and decoding it as UTF-8 published
  // every accented letter as U+FFFD.
  it('refuses a file that is not UTF-8 before sending anything', async () => {
    const { container } = await mount()
    // "München" in Windows-1252: ü is the lone byte 0xFC.
    await drop('classes.csv', new Uint8Array([0x4d, 0xfc, 0x6e, 0x63, 0x68, 0x65, 0x6e]))
    await click(container)

    expect(calls).toEqual([])
    expect(container.textContent).toContain('not saved as UTF-8')
  })

  it('refuses a spreadsheet saved in its own format', async () => {
    const { container } = await mount()
    await drop('classes.xlsx', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))
    await click(container)

    expect(calls).toEqual([])
    expect(container.textContent).toContain('spreadsheet file, not a CSV')
  })

  /**
   * ⚠ **The only way back to a batch.** Without it a closed tab or a dropped
   * connection strands the batch — and one part-way through its commit, with
   * classes already in the Atlas.
   */
  it('offers an unfinished batch back, and resumes it without re-uploading', async () => {
    answers = [
      { body: resolveReport({ done: true, pending: 0, resolved: 2, total: 2 }), ok: true },
      { body: { creating: 1, existing: 0, rowErrors: 0 }, ok: true },
      { body: reviewAnswer, ok: true },
    ]
    const { container } = await mount([
      { id: 8, status: 'uploaded', proposed: false, updatedAt: '2026-10-01T10:00:00.000Z' },
    ])
    expect(container.textContent).toContain('Unfinished imports')

    const resume = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Resume' && !button.disabled,
    )
    await act(async () => {
      resume?.click()
    })

    expect(calls.map((call) => call.url)).toEqual([
      '/api/event-imports/8/resolve?locale=de',
      '/api/event-imports/8/propose?locale=de',
      '/api/event-imports/8/review?locale=de',
    ])
    expect(window.location.search).toBe('?batch=8')
  })

  it('takes a batch part-way through its commit straight to its review', async () => {
    answers = [{ body: { ...reviewAnswer, status: 'committing' }, ok: true }]
    const { container } = await mount([
      { id: 9, status: 'committing', proposed: true, updatedAt: '2026-10-01T10:00:00.000Z' },
    ])
    const finish = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Finish it',
    )
    await act(async () => {
      finish?.click()
    })

    expect(calls.map((call) => call.url)).toEqual(['/api/event-imports/9/review?locale=de'])
    expect(container.textContent).toContain('Resume creating the classes')
    expect(container.textContent).not.toContain('Discard this batch')
  })

  it('lands back on the batch its URL names after a reload', async () => {
    window.history.replaceState(null, '', '/admin/collections/regions/11/import?batch=9')
    answers = [{ body: reviewAnswer, ok: true }]
    await mount([
      { id: 9, status: 'resolved', proposed: true, updatedAt: '2026-10-01T10:00:00.000Z' },
    ])

    expect(calls.map((call) => call.url)).toEqual(['/api/event-imports/9/review?locale=de'])
  })
})
