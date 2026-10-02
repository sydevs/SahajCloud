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
 * that renders its children, a `SelectInput` that renders nothing, and
 * `useLocale`. The real module pulls stylesheets no node runner can load, which
 * is why `importGate` was extracted from `ImportView` for the same reason.
 */

import type { ReactNode } from 'react'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STALLED_REFUSAL } from '@/components/admin/RegionImport/runPlan'

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
  useLocale: () => ({ code: ui.locale }),
}))

const { ImportRunner } = await import('@/components/admin/RegionImport/ImportRunner')

interface Call {
  body: unknown
  url: string
}

/** Scripted answers, one per request, in the order the run makes them. */
let answers: { body: unknown; ok: boolean }[]
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
    return Promise.resolve({ json: () => Promise.resolve(answer.body), ok: answer.ok })
  })
})

/**
 * What `GET /:id/review` answers, for the read the review surface makes the
 * moment a finished run mounts it. Its own decisions are pinned in
 * `event-import-review-surface.spec.ts`; here it is one more request the tab
 * sends, which is this file's subject.
 */
const reviewAnswer = {
  coordinators: { created: 0, existing: 0 },
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

async function mount(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      createElement(ImportRunner, {
        apiRoute: '/api',
        defaultLanguages: ['de'],
        languageOptions: [{ label: 'German', value: 'de' }],
        regionId: 11,
      }),
    )
  })
  return { container, root }
}

/**
 * Hand the component a file, the way the dropzone would.
 *
 * ⚠ A stand-in rather than a real `File`: jsdom 26 implements no
 * `Blob.prototype.text`, so `new File([...])` here would fail on the one method
 * the component actually calls. What it reads is `name` and `text()`.
 */
async function drop(name = 'classes.csv', text = 'title,eventType\nYoga,offline\n') {
  const file = { name, text: () => Promise.resolve(text) } as unknown as File
  await act(async () => {
    ui.dropped?.({ item: () => file } as unknown as FileList)
  })
}

async function click(container: HTMLElement) {
  const button = container.querySelector('button')
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
    const button = container.querySelector('button')
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
    expect(container.querySelector('button')?.disabled).toBe(false)
  })

  it('offers no run until a file is chosen', async () => {
    const { container } = await mount()
    expect(container.querySelector('button')?.disabled).toBe(true)
    await drop()
    expect(container.querySelector('button')?.disabled).toBe(false)
  })
})
